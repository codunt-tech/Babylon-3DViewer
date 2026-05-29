import React from 'react'

export const HEADER_HEIGHT    = 54
export const SIDEBAR_WIDTH    = 360
export const RIGHT_RAIL_WIDTH = 220

export function AppHeader({ breadcrumbs }) {
    return (
        <div
            style={{
                position: 'fixed',
                top: 0, left: 0, right: 0,
                height: HEADER_HEIGHT,
                background: 'linear-gradient(90deg, #08233b 0%, #041526 100%)',
                borderBottom: '1px solid rgba(255,255,255,0.10)',
                zIndex: 5000,
                display: 'flex',
                alignItems: 'center',
                padding: '0 16px',
                gap: 12,
            }}
        >
            <img src="/asset/images/logo.svg" alt="ABS" style={{ height: 26, width: 'auto' }} />
            {breadcrumbs}
        </div>
    )
}

// FIX: LoadingPill uses a smooth indeterminate animation when total is known
// and falls back to a pulse when total is 0 (indeterminate state)
export function LoadingPill({ progress, total }) {
    const percentage = total > 0 ? (progress / total) * 100 : 0
    const isLoading  = total > 0 && progress < total

    if (!isLoading) return null

    return (
        <div
            style={{
                position: 'fixed',
                left: '50%',
                bottom: 24,
                transform: 'translateX(-50%)',
                pointerEvents: 'none',
                zIndex: 10000,
            }}
        >
            <div
                style={{
                    background: '#ffffff',
                    color: '#0D47A1',
                    borderRadius: 9999,
                    padding: '18px 28px',
                    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
                    textAlign: 'center',
                    boxShadow: '0 18px 40px rgba(13, 71, 161, 0.14)',
                    minWidth: '420px',
                    maxWidth: '92vw',
                    border: '1px solid rgba(13, 71, 161, 0.10)',
                }}
            >
                <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 0.2, marginBottom: 10 }}>
                    Loading model — {progress} / {total}
                </div>
                {/* Track */}
                <div
                    style={{
                        position: 'relative',
                        width: '100%',
                        height: 8,
                        background: 'rgba(25, 118, 210, 0.12)',
                        borderRadius: 9999,
                        overflow: 'hidden',
                    }}
                >
                    {/* Fill bar */}
                    <div
                        style={{
                            width: `${Math.max(2, Math.min(100, percentage))}%`,
                            height: '100%',
                            background: 'linear-gradient(90deg, #1976D2, #0D47A1)',
                            borderRadius: 9999,
                            transition: 'width 0.2s ease',
                        }}
                    />
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: '#1565C0', opacity: 0.7 }}>
                    {Math.round(percentage)}% complete
                </div>
            </div>
        </div>
    )
}

export function ComponentTypesRail({ componentTypeVisibility, onToggle }) {
    const types = ['plates', 'shells', 'brackets', 'stiffeners']

    return (
        <div
            style={{
                position: 'fixed',
                top: HEADER_HEIGHT,
                right: 0,
                width: RIGHT_RAIL_WIDTH,
                height: `calc(100vh - ${HEADER_HEIGHT}px)`,
                padding: '14px 12px',
                background: 'linear-gradient(180deg, rgba(8,35,59,0.98) 0%, rgba(4,21,38,0.98) 100%)',
                borderLeft: '1px solid rgba(255,255,255,0.10)',
                zIndex: 4000,
                color: 'rgba(255,255,255,0.92)',
                boxShadow: '-8px 0 24px rgba(0,0,0,0.18)',
                pointerEvents: 'auto',
            }}
        >
            <div
                style={{
                    fontSize: 12, fontWeight: 800, letterSpacing: 0.6,
                    textTransform: 'uppercase', marginBottom: 10,
                    color: 'rgba(255,255,255,0.72)',
                }}
            >
                Component Types
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                {types.map((componentType) => {
                    const enabled = componentTypeVisibility[componentType]
                    const base    = enabled ? '#1a87c9' : 'rgba(255,255,255,0.16)'
                    return (
                        <button
                            key={componentType}
                            type="button"
                            onClick={() => onToggle(componentType)}
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                borderRadius: 10,
                                border: `1px solid ${enabled ? 'rgba(26,135,201,0.55)' : 'rgba(255,255,255,0.12)'}`,
                                background: `linear-gradient(180deg, ${base} 0%, rgba(4,21,38,0.35) 100%)`,
                                color: 'rgba(255,255,255,0.95)',
                                cursor: 'pointer',
                                fontWeight: 800,
                                fontSize: 13,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                textTransform: 'capitalize',
                            }}
                        >
                            <span
                                style={{
                                    display: 'inline-flex',
                                    width: 10, height: 10,
                                    borderRadius: 9999,
                                    background: enabled ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.45)',
                                }}
                            />
                            {componentType}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}