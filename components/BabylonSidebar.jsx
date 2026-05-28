import React, { useMemo, useState } from 'react'
import { EyeFill, EyeSlashFill } from 'react-bootstrap-icons'
import { HEADER_HEIGHT, SIDEBAR_WIDTH } from './viewerShell'

const THEME = {
  bg1: '#08233b',
  bg0: '#041526',
  line: 'rgba(255,255,255,0.08)',
  text: 'rgba(255,255,255,0.92)',
  muted: 'rgba(255,255,255,0.62)',
  soft2: 'rgba(255,255,255,0.12)'
}

function formatName(name) {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase())
}

export default function BabylonSidebar({
  compartmentNames,
  selectedCompartment,
  compartmentVisibility,
  onSelectCompartment,
  onToggleVisibility,
  isLoading
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [expanded, setExpanded] = useState(new Set())

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const sorted = [...compartmentNames].sort((a, b) => a.localeCompare(b))
    if (!q) return sorted
    return sorted.filter((n) => formatName(n).toLowerCase().includes(q))
  }, [compartmentNames, searchQuery])

  const toggleExpand = (name) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: HEADER_HEIGHT,
        left: 0,
        width: SIDEBAR_WIDTH,
        height: `calc(100vh - ${HEADER_HEIGHT}px)`,
        background: `linear-gradient(180deg, ${THEME.bg1} 0%, ${THEME.bg0} 100%)`,
        color: THEME.text,
        zIndex: 1000,
        borderRight: `1px solid ${THEME.line}`,
        boxShadow: '8px 0 24px rgba(0,0,0,0.25)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
      }}
    >
      <div style={{ padding: '14px 16px 12px', borderBottom: `1px solid ${THEME.line}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" rx="2" />
            <rect x="14" y="3" width="7" height="7" rx="2" />
            <rect x="3" y="14" width="7" height="7" rx="2" />
            <rect x="14" y="14" width="7" height="7" rx="2" />
          </svg>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.4 }}>LIST OF FUNCTIONALITIES</div>
          <button
            type="button"
            style={{
              marginLeft: 'auto',
              background: 'transparent',
              border: `1px solid ${THEME.soft2}`,
              color: THEME.text,
              borderRadius: 8,
              padding: '2px 10px',
              cursor: 'pointer',
              fontWeight: 900
            }}
            title="Collapse"
          >
            {'<<'}
          </button>
        </div>

        <div
          style={{
            marginTop: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 12px',
            borderRadius: 10,
            background: 'rgba(0,0,0,0.18)',
            border: `1px solid ${THEME.soft2}`
          }}
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" style={{ color: THEME.muted }}>
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            style={{
              width: '100%',
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: THEME.text,
              fontSize: 13,
              fontWeight: 600
            }}
          />
        </div>

        {isLoading && (
          <div style={{ marginTop: 10, fontSize: 12, color: THEME.muted, textAlign: 'center' }}>
            Loading compartments...
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: 0.5,
            color: THEME.muted,
            marginBottom: 8,
            textTransform: 'uppercase'
          }}
        >
          List of compartments
        </div>

        {filtered.map((name) => {
          const isSelected = selectedCompartment === name
          const isVisible = compartmentVisibility[name] !== false
          const isOpen = expanded.has(name)

          return (
            <div key={name} style={{ marginBottom: 6 }}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  onSelectCompartment(name)
                  toggleExpand(name)
                }}
                onKeyDown={(e) => e.key === 'Enter' && onSelectCompartment(name)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: isSelected ? 'rgba(26, 135, 201, 0.18)' : 'rgba(255,255,255,0.04)',
                  border: isSelected ? '1px solid rgba(26,135,201,0.75)' : `1px solid ${THEME.soft2}`,
                  color: isSelected ? THEME.text : THEME.muted,
                  fontWeight: isSelected ? 700 : 500,
                  fontSize: 13
                }}
              >
                <span style={{ fontSize: 12 }}>{isOpen ? '▼' : '▶'}</span>
                <span style={{ flex: 1 }}>{formatName(name)}</span>
                <button
                  type="button"
                  title={isVisible ? 'Hide' : 'Show'}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleVisibility(name)
                  }}
                  style={{
                    background: 'transparent',
                    border: `1px solid ${THEME.soft2}`,
                    borderRadius: 4,
                    padding: '4px 6px',
                    cursor: 'pointer',
                    color: THEME.text,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {isVisible ? (
                    <EyeFill size={16} />
                  ) : (
                    <EyeSlashFill size={16} />
                  )}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}