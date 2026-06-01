import React from 'react';
import { getPartDisplayName } from '../../utils/partIdUtils';

// ─── CSS injected once ────────────────────────────────────────────────────────
const CSS_ANIMATIONS = `
@keyframes contextMenuSlideIn {
  from { opacity: 0; transform: translateY(-8px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0)   scale(1);    }
}
`;

if (typeof document !== 'undefined' && !document.getElementById('context-menu-styles')) {
  const s = document.createElement('style');
  s.id = 'context-menu-styles';
  s.innerText = CSS_ANIMATIONS;
  document.head.appendChild(s);
}

const MenuIcon = ({ icon }) => {
  switch (icon) {
    case '📦':
      return (
        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M16 3v4M8 3v4M3 11h18" />
        </svg>
      );
    case '👁️':
    case '👁️‍🗨️':
      return (
        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case '🔧':
      return (
        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      );
    case '🚢':
      return (
        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M2 20a2.4 2.4 0 0 0 2 1 2.4 2.4 0 0 0 2-1 2.4 2.4 0 0 1 2-1 2.4 2.4 0 0 1 2 1 2.4 2.4 0 0 0 2 1 2.4 2.4 0 0 0 2-1 2.4 2.4 0 0 1 2-1 2.4 2.4 0 0 1 2 1" />
          <path d="M4 18V9l8-4 8 4v9" />
          <path d="M8 13h8" />
        </svg>
      );
    case '🔲':
      return (
        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
        </svg>
      );
    case '🔍':
      return (
        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
      );
    default:
      return (
        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );
  }
};

const ContextMenu = React.memo(
  ({ position, visible, menuTarget, selectedCompartment, selectedPart, viewMode, onClose, onAction }) => {
    if (!visible) return null;

    const targetCompartment = menuTarget?.compartmentName ?? selectedCompartment;
    const targetPart = menuTarget?.partId ?? selectedPart;
    const isPart = !!(targetPart && typeof targetPart === 'string');

    let title, subtitle, menuItems;

    if (!targetCompartment && !targetPart) {
      title = 'General';
      subtitle = 'Viewport';
      menuItems = [
        { label: 'Select Visible Parts', action: 'selectVisible', icon: '🔍' },
        { label: 'Fit To Screen', action: 'fitToScreen', icon: '🔲' }
      ];
    } else if (!targetCompartment) {
      title = 'No Selection';
      subtitle = '';
      menuItems = [
        { label: 'Select Visible Parts', action: 'selectVisible', icon: '🔍' },
        { label: 'Fit To Screen', action: 'fitToScreen', icon: '🔲' }
      ];
    } else if (!isPart) {
      title = 'Compartment';
      subtitle = targetCompartment.replace(/_/g, ' ');

      menuItems = [
        { label: 'Show / Hide compartment', action: 'toggleCompartmentVisibility', icon: '👁️' },
        { label: 'Isolate compartment', action: 'isolate', icon: '📌' },
        { label: 'Focus camera on compartment', action: 'fitToScreen', icon: '🔲' },
        { label: 'Select Visible Parts', action: 'selectVisible', icon: '🔍' },
        { label: 'Compartment View', action: 'compartmentView', icon: '📦' },
      ];
    } else if (viewMode === 'asset') {
      title = 'Asset View';
      subtitle = targetCompartment?.replace(/_/g, ' ') || 'No selection';
      menuItems = [
        { label: 'Compartment View', action: 'compartmentView', icon: '📦' },
        { label: 'Hull Part View', action: 'hullPartView', icon: '🔧' },
        { label: 'Fit To Screen', action: 'fitToScreen', icon: '🔲' },
        { label: 'Select Visible Parts', action: 'selectVisible', icon: '🔍' },
      ];
    } else if (viewMode === 'compartment') {
      title = 'Compartment View';
      subtitle = isPart ? getPartDisplayName(targetPart).replace(/_/g, ' ') : '';
      menuItems = [
        { label: 'Asset View', action: 'backToAsset', icon: '🚢' },
        { label: 'Hull Part View', action: 'hullPartView', icon: '🔧' },
        { label: 'Fit To Screen', action: 'fitToScreen', icon: '🔲' },
        { label: 'Hide', action: 'hide', icon: '👁️' },
        { label: 'Select Visible Parts', action: 'selectVisible', icon: '🔍' },
      ];
    } else {
      title = 'Hull Part View';
      subtitle = isPart ? getPartDisplayName(targetPart).replace(/_/g, ' ') : '';
      menuItems = [
        { label: 'Asset View', action: 'backToAsset', icon: '🚢' },
        { label: 'Compartment View', action: 'backToCompartment', icon: '📦' },
        { label: 'Fit To Screen', action: 'fitToScreen', icon: '🔲' },
        { label: 'Hide', action: 'hide', icon: '👁️' },
        { label: 'Select Visible Parts', action: 'selectVisible', icon: '🔍' },
      ];
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
                onAction(item.action);
                onClose();
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
    );
  }
);

export default ContextMenu;
