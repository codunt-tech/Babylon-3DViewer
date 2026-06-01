import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { EyeFill, EyeSlashFill } from 'react-bootstrap-icons';
import { encodePartId } from '../../utils/partIdUtils';
import { getFunctionalityGroup } from '../../services/hierarchyService';

const CSS_ANIMATIONS = `
::-webkit-scrollbar { width: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.32); }
`;

if (typeof document !== 'undefined' && !document.getElementById('sidebar-styles')) {
  const s = document.createElement('style');
  s.id = 'sidebar-styles';
  s.innerText = CSS_ANIMATIONS;
  document.head.appendChild(s);
}

const IconAnchor = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#77b3ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v6" />
    <circle cx="12" cy="4" r="1.5" />
    <path d="M6 12a6 6 0 0 0 12 0" />
    <path d="M6 12H3m18 0h-3" />
  </svg>
);

const IconDrop = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#77b3ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3s-5 5.5-5 9a5 5 0 0 0 10 0c0-3.5-5-9-5-9z" />
  </svg>
);

const IconGear = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#77b3ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1.7 1.7 0 0 1-2.4 2.4l-.1-.1a1 1 0 0 0-1.7.6V20a1.7 1.7 0 0 1-3.4 0v-.1a1 1 0 0 0-1.7-.6l-.1.1a1.7 1.7 0 0 1-2.4-2.4l.1-.1A1 1 0 0 0 4 15.9H3.5a1.7 1.7 0 0 1 0-3.4h.1a1 1 0 0 0 .7-1.7l-.1-.1a1.7 1.7 0 0 1 2.4-2.4l.1.1a1 1 0 0 0 1.7-.6V7a1.7 1.7 0 0 1 3.4 0v.1a1 1 0 0 0 1.7.6l.1-.1a1.7 1.7 0 0 1 2.4 2.4l-.1.1a1 1 0 0 0 .6 1.7H20a1.7 1.7 0 0 1 0 3.4h-.1a1 1 0 0 0-.5 1.7z" />
  </svg>
);

const IconCube = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#77b3ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l8 4.5v9L12 21 4 16.5v-9L12 3z" />
    <path d="M12 21v-9" />
    <path d="M20 7.5l-8 4.5L4 7.5" />
  </svg>
);

const IconDot = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#77b3ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="2.4" />
  </svg>
);

const FuncIcon = ({ group }) => {
  if (group.includes('PEAK')) return <IconAnchor />;
  if (group.includes('WATER') || group.includes('TANK') || group.includes('TB')) return <IconDrop />;
  if (group.includes('GEAR')) return <IconGear />;
  if (group.includes('DEEP') || group.includes('STORAGE')) return <IconCube />;
  return <IconDot />;
};

const BabylonSidebar = React.memo(({
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
  const [expandedFuncs, setExpandedFuncs] = useState(new Set());
  const [expandedComps, setExpandedComps] = useState(new Set());
  const [search, setSearch] = useState('');

  const toggleFunc = useCallback((name) => {
    setExpandedFuncs((prev) => {
      const n = new Set(prev);
      n.has(name) ? n.delete(name) : n.add(name);
      return n;
    });
  }, []);

  const toggleComp = useCallback((name) => {
    setExpandedComps((prev) => {
      const n = new Set(prev);
      n.has(name) ? n.delete(name) : n.add(name);
      return n;
    });
  }, []);

  useEffect(() => {
    if (!selectedCompartment) return;
    const group = getFunctionalityGroup(selectedCompartment);
    setExpandedFuncs((prev) => (prev.has(group) ? prev : new Set([...prev, group])));
    setExpandedComps((prev) => (prev.has(selectedCompartment) ? prev : new Set([...prev, selectedCompartment])));
  }, [selectedCompartment]);

  const grouped = useMemo(() => {
    const all = new Set();
    ['plates', 'shells', 'brackets', 'stiffeners'].forEach((type) => {
      (shipData?.[type] || []).forEach((item) => {
        if (item?.compartmentName) all.add(item.compartmentName);
      });
    });
    const byFunc = {};
    Array.from(all).forEach((name) => {
      const f = getFunctionalityGroup(name);
      (byFunc[f] = byFunc[f] || []).push(name);
    });
    return Object.keys(byFunc)
      .sort()
      .map((name) => ({ name, compartments: byFunc[name].sort() }));
  }, [shipData]);

  const hullPartsByCompartment = useMemo(() => {
    const out = {};
    const map = hullPartMeshesByCompartment || {};
    for (const [cName, hullPartMap] of Object.entries(map)) {
      out[cName] = Object.keys(hullPartMap || {}).sort((a, b) => a.localeCompare(b));
    }
    return out;
  }, [hullPartMeshesByCompartment]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toUpperCase();
    return grouped
      .map((g) => ({
        ...g,
        compartments: q
          ? g.compartments.filter((c) => c.toUpperCase().includes(q) || g.name.includes(q))
          : g.compartments,
      }))
      .filter((g) => g.compartments.length > 0);
  }, [grouped, search]);

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
      <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 800, letterSpacing: 0.8, fontSize: 12 }}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z" />
          </svg>
          <span>LIST OF FUNCTIONALITIES</span>
          <button
            type="button"
            onClick={onShowAll}
            style={{ marginLeft: 'auto', border: 0, background: 'transparent', color: 'inherit', padding: 0, cursor: 'pointer', fontWeight: 700, fontSize: 22, lineHeight: 1 }}
            title="Show all"
          >
            «
          </button>
        </div>

        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, border: '1px solid rgba(67,142,220,0.55)', background: '#00254c', padding: '8px 12px' }}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'rgba(255,255,255,0.6)', flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search compartments..."
            style={{ width: '100%', border: 0, outline: 0, background: 'transparent', color: 'rgba(255,255,255,0.95)', fontSize: 13 }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              style={{ border: 0, background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: 0, fontSize: 16, lineHeight: 1 }}
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
          const funcExpanded = expandedFuncs.has(group.name);
          return (
            <div key={group.name}>
              <div
                onClick={() => toggleFunc(group.name)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 10px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.07)', userSelect: 'none' }}
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
                    const compExpanded = expandedComps.has(cName);
                    const isVisible = compartmentVisibility?.[cName] !== false;
                    const isSelected = selectedCompartment === cName;
                    const hullParts = hullPartsByCompartment[cName] || [];

                    return (
                      <div key={cName} style={{ marginBottom: 4 }}>
                        <div
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 8px', borderRadius: 6,
                            background: isSelected ? 'rgba(26,135,201,0.22)' : 'rgba(255,255,255,0.03)',
                            border: isSelected ? '1px solid rgba(26,135,201,0.7)' : '1px solid rgba(255,255,255,0.09)',
                            cursor: 'pointer',
                          }}
                        >
                          <span onClick={() => toggleComp(cName)} style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', width: 12, flexShrink: 0, userSelect: 'none' }}>
                            {compExpanded ? '▼' : '▶'}
                          </span>
                          <span
                            onContextMenu={(e) => { e.preventDefault(); onCompartmentSelect(cName, null, { x: e.clientX, y: e.clientY }, true, null); }}
                            onClick={() => onCompartmentSelect(cName, null, null, false, null)}
                            style={{ flex: 1, fontSize: 12, fontWeight: isSelected ? 700 : 500 }}
                          >
                            {cName.replace(/_/g, ' ')}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onToggleCompartment?.(cName); }}
                            title={isVisible ? 'Hide' : 'Show'}
                            style={{
                              border: '1px solid rgba(255,255,255,0.18)', borderRadius: 4, background: 'transparent', color: 'inherit',
                              cursor: 'pointer', width: 24, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0,
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
                              const partId = encodePartId(cName, hullPartName);
                              const hidden = hiddenParts?.has(partId);
                              const partSelect = Array.isArray(selectedPart) ? selectedPart.includes(partId) : selectedPart === partId;

                              return (
                                <div
                                  key={partId}
                                  onClick={() => onCompartmentSelect(cName, partId, null, false, null)}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px', borderRadius: 5, cursor: 'pointer',
                                    background: partSelect ? 'rgba(26,135,201,0.18)' : 'transparent',
                                  }}
                                  onMouseEnter={(e) => !partSelect && (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                                  onMouseLeave={(e) => !partSelect && (e.currentTarget.style.background = 'transparent')}
                                >
                                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>▣</span>
                                  <span style={{ flex: 1, fontSize: 11, color: hidden ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.82)', textDecoration: hidden ? 'line-through' : 'none' }}>
                                    {hullPartName.replace(/_/g, ' ')}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); onTogglePartVisibility?.(partId); }}
                                    style={{
                                      border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, background: 'transparent', color: 'inherit',
                                      cursor: 'pointer', width: 22, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0,
                                    }}
                                    title={hidden ? 'Show part' : 'Hide part'}
                                  >
                                    {hidden ? <EyeSlashFill size={12} /> : <EyeFill size={12} />}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default BabylonSidebar;
