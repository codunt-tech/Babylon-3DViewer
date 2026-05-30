import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { EyeFill, EyeSlashFill } from 'react-bootstrap-icons'
import { encodePartId, getPartDisplayName } from './partIdUtils'

// ─── CSS injected once ────────────────────────────────────────────────────────

const CSS_ANIMATIONS = `
@keyframes contextMenuSlideIn {
  from { opacity: 0; transform: translateY(-8px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0)   scale(1);    }
}
::-webkit-scrollbar { width: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.32); }
`

if (typeof document !== 'undefined' && !document.getElementById('viewer-styles')) {
  const s = document.createElement('style')
  s.id = 'viewer-styles'
  s.innerText = CSS_ANIMATIONS
  document.head.appendChild(s)
}

// ─── Icon helper ──────────────────────────────────────────────────────────────

const MenuIcon = ({ icon }) => {
  switch (icon) {
    case '📦':
      return (
        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M16 3v4M8 3v4M3 11h18" />
        </svg>
      )
    case '👁️':
    case '👁️‍🗨️':
      return (
        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )
    case '🔧':
      return (
        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      )
    case '🚢':
      return (
        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M2 20a2.4 2.4 0 0 0 2 1 2.4 2.4 0 0 0 2-1 2.4 2.4 0 0 1 2-1 2.4 2.4 0 0 1 2 1 2.4 2.4 0 0 0 2 1 2.4 2.4 0 0 0 2-1 2.4 2.4 0 0 1 2-1 2.4 2.4 0 0 1 2 1" />
          <path d="M4 18V9l8-4 8 4v9" />
          <path d="M8 13h8" />
        </svg>
      )
    case '🔲':
      return (
        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
        </svg>
      )
    case '🔍':
      return (
        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
      )
    default:
      return (
        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      )
  }
}

// ─── ContextMenu ──────────────────────────────────────────────────────────────

const ContextMenu = React.memo(
  ({ position, visible, menuTarget, selectedCompartment, selectedPart, viewMode, onClose, onAction }) => {
    if (!visible) return null

    const targetCompartment = menuTarget?.compartmentName ?? selectedCompartment
    const targetPart = menuTarget?.partId ?? selectedPart
    const isPart = !!(targetPart && typeof targetPart === 'string')

    let title, subtitle, menuItems

    if (!targetCompartment && !targetPart) {
      title = 'General'
      subtitle = 'Viewport'
      menuItems = [
        { label: 'Select Visible Parts', action: 'selectVisible', icon: '🔍' },
        { label: 'Fit To Screen', action: 'fitToScreen', icon: '🔲' }
      ]
    } else if (!targetCompartment) {
      title = 'No Selection'
      subtitle = ''
      menuItems = [
        { label: 'Select Visible Parts', action: 'selectVisible', icon: '🔍' },
        { label: 'Fit To Screen', action: 'fitToScreen', icon: '🔲' }
      ]
    } else if (!isPart) {
      // Compartment-level menu
      title = 'Compartment'
      subtitle = targetCompartment.replace(/_/g, ' ')

      menuItems = [
        { label: 'Show / Hide compartment', action: 'toggleCompartmentVisibility', icon: '👁️' },
        { label: 'Isolate compartment', action: 'isolate', icon: '📌' },
        { label: 'Focus camera on compartment', action: 'fitToScreen', icon: '🔲' },
        { label: 'Select Visible Parts', action: 'selectVisible', icon: '🔍' },
        { label: 'Compartment View', action: 'compartmentView', icon: '📦' },
      ]
    } else if (viewMode === 'asset') {
      title = 'Asset View'
      subtitle = targetCompartment?.replace(/_/g, ' ') || 'No selection'
      menuItems = [
        { label: 'Compartment View', action: 'compartmentView', icon: '📦' },
        { label: 'Hull Part View', action: 'hullPartView', icon: '🔧' },
        { label: 'Fit To Screen', action: 'fitToScreen', icon: '🔲' },
        { label: 'Select Visible Parts', action: 'selectVisible', icon: '🔍' },
      ]
    } else if (viewMode === 'compartment') {
      title = 'Compartment View'
      subtitle = isPart ? getPartDisplayName(targetPart).replace(/_/g, ' ') : ''
      menuItems = [
        { label: 'Asset View', action: 'backToAsset', icon: '🚢' },
        { label: 'Hull Part View', action: 'hullPartView', icon: '🔧' },
        { label: 'Fit To Screen', action: 'fitToScreen', icon: '🔲' },
        { label: 'Hide', action: 'hide', icon: '👁️' },
        { label: 'Select Visible Parts', action: 'selectVisible', icon: '🔍' },
      ]
    } else {
      // hullPart view
      title = 'Hull Part View'
      subtitle = isPart ? getPartDisplayName(targetPart).replace(/_/g, ' ') : ''
      menuItems = [
        { label: 'Asset View', action: 'backToAsset', icon: '🚢' },
        { label: 'Compartment View', action: 'backToCompartment', icon: '📦' },
        { label: 'Fit To Screen', action: 'fitToScreen', icon: '🔲' },
        { label: 'Hide', action: 'hide', icon: '👁️' },
        { label: 'Select Visible Parts', action: 'selectVisible', icon: '🔍' },
      ]
    }


    return (
      <div
        style={{
          position: 'fixed',
          left: position.x,
          top: position.y,
          background: 'rgba(255,255,255,0.97)',
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          minWidth: 220,
          zIndex: 10000,
          overflow: 'hidden',
          fontFamily: 'Inter, system-ui, sans-serif',
          border: '1px solid rgba(0,0,0,0.08)',
          animation: 'contextMenuSlideIn 0.12s ease-out',
        }}
      >
        <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#2196F3', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 }}>{title}</div>
          <div style={{ fontSize: 12, color: '#888', fontWeight: 500 }}>{subtitle}</div>
        </div>

        <div style={{ padding: '4px 0' }}>
          {menuItems.map((item, i) => (
            <div
              key={i}
              onClick={() => {
                onAction(item.action)
                onClose()
              }}
              style={{
                padding: '9px 14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 13,
                fontWeight: 500,
                color: '#222',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f5f8ff')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ width: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>
                <MenuIcon icon={item.icon} />
              </span>
              {item.label}
            </div>
          ))}
        </div>
      </div>
    )
  }
)

// ─── Sidebar helpers ──────────────────────────────────────────────────────────

const FUNC_PATTERNS = [
  [/^CARGO_TANK/, 'CARGO TANK'],
  [/^AFT_PEAK/, 'AFT PEAK'],
  [/^FORE_PEAK/, 'FORE PEAK'],
  [/^ENGINE_ROOM/, 'ENGINE ROOM'],
  [/^CHAIN_LOCKER/, 'CHAIN LOCKER'],
  [/^DISTILLED_WATER/, 'DISTILLED WATER'],
  [/^FWD_DEEP/, 'FWD DEEP'],
  [/^POTABLE_WATER/, 'POTABLE WATER'],
  [/^PUMP_ROOM/, 'PUMP ROOM'],
  [/^SLOP_TANK/, 'SLOP TANK'],
  [/^STEERING_GEAR/, 'STEERING GEAR'],
  [/^STERN_TB/, 'STERN TB'],
  [/^STORAGE_SPACES/, 'STORAGE SPACES'],
]

const getFunctionalityGroup = (name) => {
  const upper = name.toUpperCase()
  for (const [re, label] of FUNC_PATTERNS) if (re.test(upper)) return label
  return upper.replace(/_/g, ' ')
}

const IconAnchor = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#77b3ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v6" />
    <circle cx="12" cy="4" r="1.5" />
    <path d="M6 12a6 6 0 0 0 12 0" />
    <path d="M6 12H3m18 0h-3" />
  </svg>
)

const IconDrop = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#77b3ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3s-5 5.5-5 9a5 5 0 0 0 10 0c0-3.5-5-9-5-9z" />
  </svg>
)

const IconGear = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#77b3ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1.7 1.7 0 0 1-2.4 2.4l-.1-.1a1 1 0 0 0-1.7.6V20a1.7 1.7 0 0 1-3.4 0v-.1a1 1 0 0 0-1.7-.6l-.1.1a1.7 1.7 0 0 1-2.4-2.4l.1-.1A1 1 0 0 0 4 15.9H3.5a1.7 1.7 0 0 1 0-3.4h.1a1 1 0 0 0 .7-1.7l-.1-.1a1.7 1.7 0 0 1 2.4-2.4l.1.1a1 1 0 0 0 1.7-.6V7a1.7 1.7 0 0 1 3.4 0v.1a1 1 0 0 0 1.7.6l.1-.1a1.7 1.7 0 0 1 2.4 2.4l-.1.1a1 1 0 0 0 .6 1.7H20a1.7 1.7 0 0 1 0 3.4h-.1a1 1 0 0 0-.5 1.7z" />
  </svg>
)

const IconCube = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#77b3ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l8 4.5v9L12 21 4 16.5v-9L12 3z" />
    <path d="M12 21v-9" />
    <path d="M20 7.5l-8 4.5L4 7.5" />
  </svg>
)

const IconDot = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#77b3ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="2.4" />
  </svg>
)

const FuncIcon = ({ group }) => {
  if (group.includes('PEAK')) return <IconAnchor />
  if (group.includes('WATER') || group.includes('TANK') || group.includes('TB')) return <IconDrop />
  if (group.includes('GEAR')) return <IconGear />
  if (group.includes('DEEP') || group.includes('STORAGE')) return <IconCube />
  return <IconDot />
}

// ─── HierarchicalSidebar ──────────────────────────────────────────────────────

const HierarchicalSidebar = React.memo(({
  shipData,
  loadedCompartments,
  isLoading,
  selectedCompartment,
  selectedPart,
  onCompartmentSelect,
  hiddenParts,
  onShowAll,
  topOffset = 0,
  compartmentVisibility,
  onToggleCompartment,
  onTogglePartVisibility,
  hullPartMeshesByCompartment,
}) => {
  const [expandedFuncs, setExpandedFuncs] = useState(new Set())
  const [expandedComps, setExpandedComps] = useState(new Set())
  const [search, setSearch] = useState('')

  const toggleFunc = useCallback((name) => {
    setExpandedFuncs((prev) => {
      const n = new Set(prev)
      n.has(name) ? n.delete(name) : n.add(name)
      return n
    })
  }, [])

  const toggleComp = useCallback((name) => {
    setExpandedComps((prev) => {
      const n = new Set(prev)
      n.has(name) ? n.delete(name) : n.add(name)
      return n
    })
  }, [])

  useEffect(() => {
    if (!selectedCompartment) return
    const group = getFunctionalityGroup(selectedCompartment)
    setExpandedFuncs((prev) => (prev.has(group) ? prev : new Set([...prev, group])))
    setExpandedComps((prev) => (prev.has(selectedCompartment) ? prev : new Set([...prev, selectedCompartment])))
  }, [selectedCompartment])

  const grouped = useMemo(() => {
    const all = new Set()
    ;['plates', 'shells', 'brackets', 'stiffeners'].forEach((type) => {
      ;(shipData?.[type] || []).forEach((item) => {
        if (item?.compartmentName) all.add(item.compartmentName)
      })
    })
    const byFunc = {}
    Array.from(all).forEach((name) => {
      const f = getFunctionalityGroup(name)
      ;(byFunc[f] = byFunc[f] || []).push(name)
    })
    return Object.keys(byFunc)
      .sort()
      .map((name) => ({ name, compartments: byFunc[name].sort() }))
  }, [shipData])

  // Canonical hull-part listing derived from Babylon meshes map if provided.
  const hullPartsByCompartment = useMemo(() => {
    const out = {}
    const map = hullPartMeshesByCompartment || {}

    for (const [cName, hullPartMap] of Object.entries(map)) {
      out[cName] = Object.keys(hullPartMap || {}).sort((a, b) => a.localeCompare(b))
    }

    return out
  }, [hullPartMeshesByCompartment])

  const filteredGroups = useMemo(() => {
    const q = search.trim().toUpperCase()
    return grouped
      .map((g) => ({
        ...g,
        compartments: q
          ? g.compartments.filter((c) => c.toUpperCase().includes(q) || g.name.includes(q))
          : g.compartments,
      }))
      .filter((g) => g.compartments.length > 0)
  }, [grouped, search])

  return (
    <div
      style={{
        position: 'fixed',
        top: `${topOffset}px`,
        left: 0,
        width: '390px',
        height: `calc(100vh - ${topOffset}px)`,
        background: '#001b37',
        borderRight: '1px solid rgba(255,255,255,0.08)',
        color: 'rgba(255,255,255,0.92)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1000,
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      }}
    >
      <div
        style={{
          padding: '14px 14px 10px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 800, letterSpacing: 0.8, fontSize: 12 }}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z" />
          </svg>
          <span>LIST OF FUNCTIONALITIES</span>
          <button
            type="button"
            onClick={onShowAll}
            style={{
              marginLeft: 'auto',
              border: 0,
              background: 'transparent',
              color: 'inherit',
              padding: 0,
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 22,
              lineHeight: 1,
            }}
            title="Show all"
          >
            «
          </button>
        </div>

        <div
          style={{
            marginTop: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            borderRadius: 8,
            border: '1px solid rgba(67,142,220,0.55)',
            background: '#00254c',
            padding: '8px 12px',
          }}
        >
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: 'rgba(255,255,255,0.6)', flexShrink: 0 }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search compartments..."
            style={{
              width: '100%',
              border: 0,
              outline: 0,
              background: 'transparent',
              color: 'rgba(255,255,255,0.95)',
              fontSize: 13,
            }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              style={{
                border: 0,
                background: 'transparent',
                color: 'rgba(255,255,255,0.5)',
                cursor: 'pointer',
                padding: 0,
                fontSize: 16,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          )}
        </div>

        {isLoading && (
          <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>Loading…</div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 24px' }}>
        {filteredGroups.map((group) => {
          const funcExpanded = expandedFuncs.has(group.name)
          return (
            <div key={group.name}>
              <div
                onClick={() => toggleFunc(group.name)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '11px 10px',
                  cursor: 'pointer',
                  borderBottom: '1px solid rgba(255,255,255,0.07)',
                  userSelect: 'none',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ width: 18, display: 'inline-flex', justifyContent: 'center', flexShrink: 0 }}>
                  <FuncIcon group={group.name} />
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3, flex: 1, textTransform: 'uppercase' }}>{group.name}</span>
                <span style={{ color: '#6ea8ea', fontSize: 14, flexShrink: 0 }}>{funcExpanded ? '▾' : '›'}</span>
              </div>

              {funcExpanded && (
                <div style={{ paddingLeft: 8, marginTop: 4, marginBottom: 4 }}>
                  <div style={{ fontSize: 10, letterSpacing: 0.5, color: 'rgba(255,255,255,0.45)', marginBottom: 4, paddingLeft: 4 }}>COMPARTMENTS</div>
                  {group.compartments.map((cName) => {
                    const compExpanded = expandedComps.has(cName)
                    const isVisible = compartmentVisibility?.[cName] !== false
                    const isSelected = selectedCompartment === cName
                    const hullParts = hullPartsByCompartment[cName] || []

                    return (
                      <div key={cName} style={{ marginBottom: 4 }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '7px 8px',
                            borderRadius: 6,
                            background: isSelected ? 'rgba(26,135,201,0.22)' : 'rgba(255,255,255,0.03)',
                            border: isSelected ? '1px solid rgba(26,135,201,0.7)' : '1px solid rgba(255,255,255,0.09)',
                            cursor: 'pointer',
                          }}
                        >
                          <span
                            onClick={() => toggleComp(cName)}
                            style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', width: 12, flexShrink: 0, userSelect: 'none' }}
                          >
                            {compExpanded ? '▼' : '▶'}
                          </span>
                          <span
                            onContextMenu={(e) => {
                              e.preventDefault()
                              // Right-click on a compartment: open context menu with compartment-level target.
                              // Ensure selection is highlighted/active.
                              onCompartmentSelect(cName, null, { x: e.clientX, y: e.clientY }, true, null)
                            }}
                            onClick={() => onCompartmentSelect(cName, null, null, false, null)}
                            style={{ flex: 1, fontSize: 12, fontWeight: isSelected ? 700 : 500 }}
                          >
                            {cName.replace(/_/g, ' ')}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              onToggleCompartment?.(cName)
                            }}
                            title={isVisible ? 'Hide' : 'Show'}
                            style={{
                              border: '1px solid rgba(255,255,255,0.18)',
                              borderRadius: 4,
                              background: 'transparent',
                              color: 'inherit',
                              cursor: 'pointer',
                              width: 24,
                              height: 22,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: 0,
                              flexShrink: 0,
                            }}
                          >
                            {isVisible ? <EyeFill size={13} /> : <EyeSlashFill size={13} />}
                          </button>
                        </div>

                        {compExpanded && (
                          <div style={{ marginTop: 4, marginLeft: 14 }}>
                            <div style={{ fontSize: 10, letterSpacing: 0.5, color: 'rgba(255,255,255,0.4)', marginBottom: 3 }}>LIST OF HULLPARTS</div>

                            {hullParts.length === 0 && !loadedCompartments?.[cName] && (
                              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', padding: '3px 6px' }}>Click compartment to load…</div>
                            )}
                            {hullParts.length === 0 && loadedCompartments?.[cName] && (
                              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', padding: '3px 6px' }}>No hullparts found</div>
                            )}

                            {hullParts.map((hullPartName) => {
                              const partId = encodePartId(cName, hullPartName)
                              const hidden = hiddenParts?.has(partId)
                              const partSelect = Array.isArray(selectedPart) ? selectedPart.includes(partId) : selectedPart === partId

                              return (
                                <div
                                  key={partId}
                                  onClick={() => onCompartmentSelect(cName, partId, null, false, null)}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '5px 6px',
                                    borderRadius: 5,
                                    cursor: 'pointer',
                                    background: partSelect ? 'rgba(26,135,201,0.18)' : 'transparent',
                                  }}
                                  onMouseEnter={(e) => !partSelect && (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                                  onMouseLeave={(e) => !partSelect && (e.currentTarget.style.background = 'transparent')}
                                >
                                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>▣</span>
                                  <span
                                    style={{
                                      flex: 1,
                                      fontSize: 11,
                                      color: hidden ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.82)',
                                      textDecoration: hidden ? 'line-through' : 'none',
                                    }}
                                  >
                                    {hullPartName.replace(/_/g, ' ')}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      onTogglePartVisibility?.(partId)
                                    }}
                                    style={{
                                      border: '1px solid rgba(255,255,255,0.15)',
                                      borderRadius: 4,
                                      background: 'transparent',
                                      color: 'inherit',
                                      cursor: 'pointer',
                                      width: 22,
                                      height: 20,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      padding: 0,
                                      flexShrink: 0,
                                    }}
                                    title={hidden ? 'Show part' : 'Hide part'}
                                  >
                                    {hidden ? <EyeSlashFill size={12} /> : <EyeFill size={12} />}
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
})

export { ContextMenu, HierarchicalSidebar }
