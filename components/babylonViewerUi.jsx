import React, { useState, useEffect, useMemo } from 'react'

// CSS Animations for Professional UI
const CSS_ANIMATIONS = `
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes contextMenuSlideIn {
  from { opacity: 0; transform: translateY(-10px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes loadingShine {
  0% { transform: translateX(-100%); }
  50% { transform: translateX(100%); }
  100% { transform: translateX(100%); }
}

@keyframes loadingDot {
  0%, 80%, 100% { 
    transform: scale(0.8);
    opacity: 0.5;
  }
  40% { 
    transform: scale(1.2);
    opacity: 1;
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}

input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  background: transparent;
  cursor: pointer;
}

input[type="range"]::-webkit-slider-track {
  background: transparent;
}

input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  background: #fff;
  height: 20px;
  width: 20px;
  border-radius: 50%;
  border: 2px solid #2196F3;
  box-shadow: 0 2px 6px rgba(0,0,0,0.2);
  cursor: pointer;
  transition: all 0.2s ease;
}

input[type="range"]::-webkit-slider-thumb:hover {
  transform: scale(1.1);
  box-shadow: 0 4px 12px rgba(33, 150, 243, 0.4);
}

input[type="range"]::-moz-range-track {
  background: transparent;
}

input[type="range"]::-moz-range-thumb {
  background: #fff;
  height: 20px;
  width: 20px;
  border-radius: 50%;
  border: 2px solid #2196F3;
  box-shadow: 0 2px 6px rgba(0,0,0,0.2);
  cursor: pointer;
  transition: all 0.2s ease;
}

::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;
  transition: background 0.2s ease;
}

::-webkit-scrollbar-thumb:hover {
  background: #a1a1a1;
}
`

// Professional Design System
const DESIGN_SYSTEM = {
  colors: {
    primary: {
      50: '#E3F2FD',
      100: '#BBDEFB', 
      500: '#2196F3',
      600: '#1976D2',
      700: '#1565C0',
      900: '#0D47A1'
    },
    secondary: {
      50: '#F3E5F5',
      500: '#9C27B0',
      600: '#7B1FA2'
    },
    success: {
      50: '#E8F5E8',
      500: '#4CAF50',
      600: '#43A047'
    },
    warning: {
      50: '#FFF8E1',
      500: '#FF9800',
      600: '#F57C00'
    },
    error: {
      50: '#FFEBEE',
      500: '#F44336',
      600: '#E53935',
      700: '#D32F2F',
      900: '#B71C1C'
    },
    neutral: {
      50: '#FAFAFA',
      100: '#F5F5F5',
      200: '#EEEEEE',
      300: '#E0E0E0',
      400: '#BDBDBD',
      500: '#9E9E9E',
      600: '#757575',
      700: '#616161',
      800: '#424242',
      900: '#212121'
    }
  },
  typography: {
    fontFamily: "'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontSize: {
      xs: '0.75rem',    // 12px
      sm: '0.875rem',   // 14px  
      base: '1rem',     // 16px
      lg: '1.125rem',   // 18px
      xl: '1.25rem',    // 20px
      '2xl': '1.5rem',  // 24px
      '3xl': '1.875rem' // 30px
    },
    fontWeight: {
      normal: '400',
      medium: '500',
      semibold: '600',
      bold: '700'
    },
    lineHeight: {
      tight: '1.25',
      normal: '1.5',
      relaxed: '1.625'
    }
  },
  spacing: {
    xs: '0.25rem',   // 4px
    sm: '0.5rem',    // 8px  
    md: '0.75rem',   // 12px
    lg: '1rem',      // 16px
    xl: '1.25rem',   // 20px
    '2xl': '1.5rem', // 24px
    '3xl': '2rem',   // 32px
    '4xl': '2.5rem', // 40px
    '5xl': '3rem'    // 48px
  },
  borderRadius: {
    sm: '0.25rem',   // 4px
    md: '0.375rem',  // 6px
    lg: '0.5rem',    // 8px
    xl: '0.75rem',   // 12px
    '2xl': '1rem'    // 16px
  },
  shadow: {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
  },
  animation: {
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    hover: 'all 0.15s ease-in-out'
  }
}

// Inject CSS animations
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style')
  styleSheet.type = 'text/css'
  styleSheet.innerText = CSS_ANIMATIONS
  document.head.appendChild(styleSheet)
}
const AnomalyListDialog = React.memo(({ visible, anomalies, onClose, onEditAnomaly, onRemoveAnomaly }) => {
  if (!visible) return null

  const anomalyArray = Array.from(anomalies.entries()).map(([partId, anomalyData]) => ({
    partId,
    ...anomalyData
  }))

  const formatPartName = (partId) => {
    return partId?.split('-').slice(1).join('-') || 'Unknown Part'
  }

  const formatCompartmentName = (partId) => {
    return partId?.split('-')[0]?.replace(/_/g, ' ') || 'Unknown Compartment'
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 20000,
      animation: 'fadeIn 0.2s ease-out'
    }}>
      <div style={{
        background: DESIGN_SYSTEM.colors.neutral[50],
        borderRadius: DESIGN_SYSTEM.borderRadius['2xl'],
        padding: DESIGN_SYSTEM.spacing['3xl'],
        minWidth: '700px',
        maxWidth: '900px',
        maxHeight: '85vh',
        overflow: 'hidden',
        boxShadow: DESIGN_SYSTEM.shadow['2xl'],
        border: `1px solid ${DESIGN_SYSTEM.colors.neutral[200]}`,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: DESIGN_SYSTEM.typography.fontFamily
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: DESIGN_SYSTEM.spacing['2xl'],
          paddingBottom: DESIGN_SYSTEM.spacing.lg,
          borderBottom: `1px solid ${DESIGN_SYSTEM.colors.neutral[200]}`
        }}>
          <div>
            <h2 style={{
              margin: 0,
              color: DESIGN_SYSTEM.colors.error[700],
              fontSize: DESIGN_SYSTEM.typography.fontSize['2xl'],
              fontWeight: DESIGN_SYSTEM.typography.fontWeight.bold,
              lineHeight: DESIGN_SYSTEM.typography.lineHeight.tight,
              display: 'flex',
              alignItems: 'center',
              gap: DESIGN_SYSTEM.spacing.md
            }}>
                          <svg width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M12 9v4m0 4h.01"/>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            </svg>
            Ship Anomaly Report
            </h2>
            <p style={{
              margin: `${DESIGN_SYSTEM.spacing.sm} 0 0 0`,
              color: DESIGN_SYSTEM.colors.neutral[600],
              fontSize: DESIGN_SYSTEM.typography.fontSize.sm,
              fontWeight: DESIGN_SYSTEM.typography.fontWeight.medium
            }}>
              {anomalyArray.length} {anomalyArray.length === 1 ? 'anomaly' : 'anomalies'} detected across ship components
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: DESIGN_SYSTEM.typography.fontSize.xl,
              cursor: 'pointer',
              color: DESIGN_SYSTEM.colors.neutral[400],
              padding: DESIGN_SYSTEM.spacing.sm,
              borderRadius: DESIGN_SYSTEM.borderRadius.md,
              transition: DESIGN_SYSTEM.animation.hover,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px'
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = DESIGN_SYSTEM.colors.neutral[100]
              e.target.style.color = DESIGN_SYSTEM.colors.neutral[600]
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = 'transparent'
              e.target.style.color = DESIGN_SYSTEM.colors.neutral[400]
            }}
          >
            ✕
          </button>
        </div>
        
        <div style={{
          flex: 1,
          overflowY: 'auto',
          maxHeight: '60vh',
          marginRight: `-${DESIGN_SYSTEM.spacing.lg}`,
          paddingRight: DESIGN_SYSTEM.spacing.lg
        }}>
          {anomalyArray.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: DESIGN_SYSTEM.spacing['5xl'],
              color: DESIGN_SYSTEM.colors.neutral[500],
              fontSize: DESIGN_SYSTEM.typography.fontSize.base,
              fontWeight: DESIGN_SYSTEM.typography.fontWeight.medium
            }}>
              <svg width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ 
                marginBottom: DESIGN_SYSTEM.spacing.lg,
                opacity: 0.5
              }}>
                <circle cx="11" cy="11" r="8"/>
                <path d="M21 21l-4.35-4.35"/>
              </svg>
              No anomalies detected
            </div>
          ) : (
            anomalyArray.map((anomaly, index) => (
              <div
                key={anomaly.partId}
                style={{
                  padding: DESIGN_SYSTEM.spacing.xl,
                  marginBottom: DESIGN_SYSTEM.spacing.lg,
                  border: `2px solid ${anomaly.color}20`,
                  borderLeft: `4px solid ${anomaly.color}`,
                  borderRadius: DESIGN_SYSTEM.borderRadius.xl,
                  backgroundColor: `${anomaly.color}08`,
                  transition: DESIGN_SYSTEM.animation.hover,
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = `${anomaly.color}15`
                  e.target.style.transform = 'translateY(-1px)'
                  e.target.style.boxShadow = DESIGN_SYSTEM.shadow.md
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = `${anomaly.color}08`
                  e.target.style.transform = 'translateY(0)'
                  e.target.style.boxShadow = 'none'
                }}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: DESIGN_SYSTEM.spacing.xl
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: DESIGN_SYSTEM.typography.fontSize.lg,
                      fontWeight: DESIGN_SYSTEM.typography.fontWeight.semibold,
                      color: DESIGN_SYSTEM.colors.neutral[900],
                      marginBottom: DESIGN_SYSTEM.spacing.sm,
                      lineHeight: DESIGN_SYSTEM.typography.lineHeight.tight
                    }}>
                      {formatCompartmentName(anomaly.partId)}
                    </div>
                    <div style={{
                      fontSize: DESIGN_SYSTEM.typography.fontSize.sm,
                      color: DESIGN_SYSTEM.colors.neutral[600],
                      marginBottom: DESIGN_SYSTEM.spacing.sm,
                      fontWeight: DESIGN_SYSTEM.typography.fontWeight.medium
                    }}>
                      Component: {formatPartName(anomaly.partId)}
                    </div>
                    {anomaly.position && (
                      <div style={{
                        fontSize: DESIGN_SYSTEM.typography.fontSize.sm,
                        color: DESIGN_SYSTEM.colors.neutral[600],
                        marginBottom: DESIGN_SYSTEM.spacing.lg,
                        fontWeight: DESIGN_SYSTEM.typography.fontWeight.medium
                      }}>
                        Position: X: {anomaly.position.x}, Y: {anomaly.position.y}, Z: {anomaly.position.z}
                      </div>
                    )}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: DESIGN_SYSTEM.spacing.md,
                      marginBottom: anomaly.description ? DESIGN_SYSTEM.spacing.lg : 0
                    }}>
                      <div style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        backgroundColor: anomaly.color,
                        boxShadow: `0 0 0 2px ${anomaly.color}30`
                      }}></div>
                      <span style={{
                        color: anomaly.color,
                        fontWeight: DESIGN_SYSTEM.typography.fontWeight.bold,
                        fontSize: DESIGN_SYSTEM.typography.fontSize.base
                      }}>
                        {anomaly.label}
                      </span>
                      <span style={{
                        backgroundColor: `${anomaly.color}20`,
                        color: anomaly.color,
                        padding: `${DESIGN_SYSTEM.spacing.xs} ${DESIGN_SYSTEM.spacing.sm}`,
                        borderRadius: DESIGN_SYSTEM.borderRadius.sm,
                        fontSize: DESIGN_SYSTEM.typography.fontSize.xs,
                        fontWeight: DESIGN_SYSTEM.typography.fontWeight.bold
                      }}>
                        {anomaly.percentage}%
                      </span>
                    </div>
                    {anomaly.description && (
                      <div style={{
                        fontSize: DESIGN_SYSTEM.typography.fontSize.sm,
                        color: DESIGN_SYSTEM.colors.neutral[700],
                        fontStyle: 'italic',
                        backgroundColor: DESIGN_SYSTEM.colors.neutral[50],
                        padding: DESIGN_SYSTEM.spacing.md,
                        borderRadius: DESIGN_SYSTEM.borderRadius.md,
                        border: `1px solid ${DESIGN_SYSTEM.colors.neutral[200]}`
                      }}>
                        "{anomaly.description}"
                      </div>
                    )}
                  </div>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: DESIGN_SYSTEM.spacing.sm
                  }}>
                    <button
                      onClick={() => onEditAnomaly(anomaly.partId)}
                      style={{
                        padding: `${DESIGN_SYSTEM.spacing.sm} ${DESIGN_SYSTEM.spacing.lg}`,
                        backgroundColor: DESIGN_SYSTEM.colors.primary[500],
                        color: 'white',
                        border: 'none',
                        borderRadius: DESIGN_SYSTEM.borderRadius.md,
                        cursor: 'pointer',
                        fontSize: DESIGN_SYSTEM.typography.fontSize.sm,
                        fontWeight: DESIGN_SYSTEM.typography.fontWeight.medium,
                        fontFamily: DESIGN_SYSTEM.typography.fontFamily,
                        transition: DESIGN_SYSTEM.animation.hover,
                        boxShadow: DESIGN_SYSTEM.shadow.sm,
                        minWidth: '80px'
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.backgroundColor = DESIGN_SYSTEM.colors.primary[600]
                        e.target.style.transform = 'translateY(-1px)'
                        e.target.style.boxShadow = DESIGN_SYSTEM.shadow.md
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.backgroundColor = DESIGN_SYSTEM.colors.primary[500]
                        e.target.style.transform = 'translateY(0)'
                        e.target.style.boxShadow = DESIGN_SYSTEM.shadow.sm
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => onRemoveAnomaly(anomaly.partId)}
                      style={{
                        padding: `${DESIGN_SYSTEM.spacing.sm} ${DESIGN_SYSTEM.spacing.lg}`,
                        backgroundColor: DESIGN_SYSTEM.colors.error[500],
                        color: 'white',
                        border: 'none',
                        borderRadius: DESIGN_SYSTEM.borderRadius.md,
                        cursor: 'pointer',
                        fontSize: DESIGN_SYSTEM.typography.fontSize.sm,
                        fontWeight: DESIGN_SYSTEM.typography.fontWeight.medium,
                        fontFamily: DESIGN_SYSTEM.typography.fontFamily,
                        transition: DESIGN_SYSTEM.animation.hover,
                        boxShadow: DESIGN_SYSTEM.shadow.sm,
                        minWidth: '80px'
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.backgroundColor = DESIGN_SYSTEM.colors.error[600]
                        e.target.style.transform = 'translateY(-1px)'
                        e.target.style.boxShadow = DESIGN_SYSTEM.shadow.md
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.backgroundColor = DESIGN_SYSTEM.colors.error[500]
                        e.target.style.transform = 'translateY(0)'
                        e.target.style.boxShadow = DESIGN_SYSTEM.shadow.sm
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
})

const AnomalyDialog = React.memo(({ visible, partName, onSave, onCancel, existingAnomaly }) => {
  const [damagePercentage, setDamagePercentage] = useState(existingAnomaly?.percentage || 0)
  const [description, setDescription] = useState(existingAnomaly?.description || '')

  useEffect(() => {
    if (existingAnomaly) {
      setDamagePercentage(existingAnomaly.percentage)
      setDescription(existingAnomaly.description)
    } else {
      setDamagePercentage(0)
      setDescription('')
    }
  }, [existingAnomaly, visible])

  if (!visible) return null

  const getDamageColor = (percentage) => {
    if (percentage === 0) return DESIGN_SYSTEM.colors.success[500]
    if (percentage <= 25) return '#FFEB3B'
    if (percentage <= 50) return DESIGN_SYSTEM.colors.warning[500]
    if (percentage <= 75) return '#FF5722'
    return DESIGN_SYSTEM.colors.error[700]
  }

  const getDamageLabel = (percentage) => {
    if (percentage === 0) return 'No Damage'
    if (percentage <= 25) return 'Minor Damage'
    if (percentage <= 50) return 'Moderate Damage'
    if (percentage <= 75) return 'Severe Damage'
    return 'Critical Damage'
  }

  const formatPartName = (partName) => {
    return partName?.split('-').slice(1).join('-') || 'Unknown Part'
  }

  const formatCompartmentName = (partName) => {
    return partName?.split('-')[0]?.replace(/_/g, ' ') || 'Unknown Compartment'
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 20000,
      animation: 'fadeIn 0.2s ease-out'
    }}>
      <div style={{
        background: DESIGN_SYSTEM.colors.neutral[50],
        borderRadius: DESIGN_SYSTEM.borderRadius['2xl'],
        padding: DESIGN_SYSTEM.spacing['3xl'],
        minWidth: '480px',
        maxWidth: '600px',
        boxShadow: DESIGN_SYSTEM.shadow['2xl'],
        border: `1px solid ${DESIGN_SYSTEM.colors.neutral[200]}`,
        fontFamily: DESIGN_SYSTEM.typography.fontFamily
      }}>
        <div style={{
          marginBottom: DESIGN_SYSTEM.spacing['2xl'],
          paddingBottom: DESIGN_SYSTEM.spacing.lg,
          borderBottom: `1px solid ${DESIGN_SYSTEM.colors.neutral[200]}`
        }}>
          <h2 style={{
            margin: 0,
            color: DESIGN_SYSTEM.colors.error[700],
            fontSize: DESIGN_SYSTEM.typography.fontSize['2xl'],
            fontWeight: DESIGN_SYSTEM.typography.fontWeight.bold,
            lineHeight: DESIGN_SYSTEM.typography.lineHeight.tight,
            display: 'flex',
            alignItems: 'center',
            gap: DESIGN_SYSTEM.spacing.md,
            marginBottom: DESIGN_SYSTEM.spacing.sm
          }}>
            <svg width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M12 9v4m0 4h.01"/>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            </svg>
            {existingAnomaly ? 'Edit Anomaly' : 'Create Anomaly'}
          </h2>
          <p style={{
            margin: 0,
            color: DESIGN_SYSTEM.colors.neutral[600],
            fontSize: DESIGN_SYSTEM.typography.fontSize.sm,
            fontWeight: DESIGN_SYSTEM.typography.fontWeight.medium
          }}>
            Document damage assessment for ship component
          </p>
        </div>
        
        <div style={{ marginBottom: DESIGN_SYSTEM.spacing.xl }}>
          <div style={{
            backgroundColor: DESIGN_SYSTEM.colors.primary[50],
            padding: DESIGN_SYSTEM.spacing.lg,
            borderRadius: DESIGN_SYSTEM.borderRadius.lg,
            border: `1px solid ${DESIGN_SYSTEM.colors.primary[200]}`
          }}>
            <div style={{
              fontSize: DESIGN_SYSTEM.typography.fontSize.sm,
              color: DESIGN_SYSTEM.colors.primary[700],
              fontWeight: DESIGN_SYSTEM.typography.fontWeight.medium,
              marginBottom: DESIGN_SYSTEM.spacing.xs
            }}>
              Compartment
            </div>
            <div style={{
              fontSize: DESIGN_SYSTEM.typography.fontSize.lg,
              color: DESIGN_SYSTEM.colors.primary[900],
              fontWeight: DESIGN_SYSTEM.typography.fontWeight.semibold,
              marginBottom: DESIGN_SYSTEM.spacing.sm
            }}>
              {formatCompartmentName(partName)}
            </div>
            <div style={{
              fontSize: DESIGN_SYSTEM.typography.fontSize.sm,
              color: DESIGN_SYSTEM.colors.neutral[600],
              fontWeight: DESIGN_SYSTEM.typography.fontWeight.medium,
              marginBottom: DESIGN_SYSTEM.spacing.xs
            }}>
              Component: {formatPartName(partName)}
            </div>
            {existingAnomaly?.position && (
              <div style={{
                fontSize: DESIGN_SYSTEM.typography.fontSize.sm,
                color: DESIGN_SYSTEM.colors.neutral[600],
                fontWeight: DESIGN_SYSTEM.typography.fontWeight.medium
              }}>
                Position: X: {existingAnomaly.position.x}, Y: {existingAnomaly.position.y}, Z: {existingAnomaly.position.z}
              </div>
            )}
          </div>
        </div>

        <div style={{ marginBottom: DESIGN_SYSTEM.spacing['2xl'] }}>
          <label style={{ 
            display: 'block', 
            marginBottom: DESIGN_SYSTEM.spacing.lg, 
            color: DESIGN_SYSTEM.colors.neutral[900], 
            fontSize: DESIGN_SYSTEM.typography.fontSize.base, 
            fontWeight: DESIGN_SYSTEM.typography.fontWeight.semibold
          }}>
            Damage Assessment: {damagePercentage}%
          </label>
          
          <div style={{ marginBottom: DESIGN_SYSTEM.spacing.lg }}>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={damagePercentage}
              onChange={(e) => setDamagePercentage(parseInt(e.target.value))}
              style={{
                width: '100%',
                height: '12px',
                borderRadius: DESIGN_SYSTEM.borderRadius.md,
                background: `linear-gradient(to right, 
                  ${DESIGN_SYSTEM.colors.success[500]} 0%, 
                  #FFEB3B 25%, 
                  ${DESIGN_SYSTEM.colors.warning[500]} 50%, 
                  #FF5722 75%, 
                  ${DESIGN_SYSTEM.colors.error[700]} 100%)`,
                outline: 'none',
                cursor: 'pointer',
                WebkitAppearance: 'none',
                appearance: 'none'
              }}
            />
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: DESIGN_SYSTEM.spacing.sm,
              fontSize: DESIGN_SYSTEM.typography.fontSize.xs,
              color: DESIGN_SYSTEM.colors.neutral[500],
              fontWeight: DESIGN_SYSTEM.typography.fontWeight.medium
            }}>
              <span>0%</span>
              <span>25%</span>
              <span>50%</span>
              <span>75%</span>
              <span>100%</span>
            </div>
          </div>
          
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: DESIGN_SYSTEM.spacing.lg,
            padding: DESIGN_SYSTEM.spacing.lg,
            backgroundColor: `${getDamageColor(damagePercentage)}15`,
            borderRadius: DESIGN_SYSTEM.borderRadius.lg,
            border: `2px solid ${getDamageColor(damagePercentage)}40`
          }}>
            <div style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              backgroundColor: getDamageColor(damagePercentage),
              boxShadow: `0 0 0 3px ${getDamageColor(damagePercentage)}30`,
              flexShrink: 0
            }}></div>
            <div>
              <div style={{
                color: getDamageColor(damagePercentage),
                fontWeight: DESIGN_SYSTEM.typography.fontWeight.bold,
                fontSize: DESIGN_SYSTEM.typography.fontSize.lg,
                lineHeight: DESIGN_SYSTEM.typography.lineHeight.tight
              }}>
                {getDamageLabel(damagePercentage)}
              </div>
              <div style={{
                color: getDamageColor(damagePercentage),
                fontSize: DESIGN_SYSTEM.typography.fontSize.sm,
                fontWeight: DESIGN_SYSTEM.typography.fontWeight.medium,
                opacity: 0.8
              }}>
                {damagePercentage}% structural integrity affected
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: DESIGN_SYSTEM.spacing['3xl'] }}>
          <label style={{ 
            display: 'block', 
            marginBottom: DESIGN_SYSTEM.spacing.md, 
            color: DESIGN_SYSTEM.colors.neutral[900], 
            fontSize: DESIGN_SYSTEM.typography.fontSize.base, 
            fontWeight: DESIGN_SYSTEM.typography.fontWeight.semibold
          }}>
            Description <span style={{ 
              color: DESIGN_SYSTEM.colors.neutral[500], 
              fontWeight: DESIGN_SYSTEM.typography.fontWeight.normal,
              fontSize: DESIGN_SYSTEM.typography.fontSize.sm
            }}>(Optional)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the nature of damage, location details, or repair recommendations..."
            style={{
              width: '100%',
              height: '100px',
              padding: DESIGN_SYSTEM.spacing.lg,
              border: `2px solid ${DESIGN_SYSTEM.colors.neutral[300]}`,
              borderRadius: DESIGN_SYSTEM.borderRadius.lg,
              fontSize: DESIGN_SYSTEM.typography.fontSize.sm,
              fontFamily: DESIGN_SYSTEM.typography.fontFamily,
              fontWeight: DESIGN_SYSTEM.typography.fontWeight.normal,
              lineHeight: DESIGN_SYSTEM.typography.lineHeight.relaxed,
              resize: 'vertical',
              outline: 'none',
              transition: DESIGN_SYSTEM.animation.transition,
              backgroundColor: DESIGN_SYSTEM.colors.neutral[50]
            }}
            onFocus={(e) => {
              e.target.style.borderColor = DESIGN_SYSTEM.colors.primary[500]
              e.target.style.backgroundColor = 'white'
              e.target.style.boxShadow = `0 0 0 3px ${DESIGN_SYSTEM.colors.primary[500]}20`
            }}
            onBlur={(e) => {
              e.target.style.borderColor = DESIGN_SYSTEM.colors.neutral[300]
              e.target.style.backgroundColor = DESIGN_SYSTEM.colors.neutral[50]
              e.target.style.boxShadow = 'none'
            }}
          />
        </div>

        <div style={{
          display: 'flex',
          gap: DESIGN_SYSTEM.spacing.lg,
          justifyContent: 'flex-end',
          paddingTop: DESIGN_SYSTEM.spacing.lg,
          borderTop: `1px solid ${DESIGN_SYSTEM.colors.neutral[200]}`
        }}>
          <button
            onClick={onCancel}
            style={{
              padding: `${DESIGN_SYSTEM.spacing.md} ${DESIGN_SYSTEM.spacing['2xl']}`,
              backgroundColor: 'transparent',
              color: DESIGN_SYSTEM.colors.neutral[600],
              border: `2px solid ${DESIGN_SYSTEM.colors.neutral[300]}`,
              borderRadius: DESIGN_SYSTEM.borderRadius.lg,
              cursor: 'pointer',
              fontSize: DESIGN_SYSTEM.typography.fontSize.sm,
              fontWeight: DESIGN_SYSTEM.typography.fontWeight.semibold,
              fontFamily: DESIGN_SYSTEM.typography.fontFamily,
              transition: DESIGN_SYSTEM.animation.hover,
              minWidth: '100px'
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = DESIGN_SYSTEM.colors.neutral[100]
              e.target.style.borderColor = DESIGN_SYSTEM.colors.neutral[400]
              e.target.style.color = DESIGN_SYSTEM.colors.neutral[700]
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = 'transparent'
              e.target.style.borderColor = DESIGN_SYSTEM.colors.neutral[300]
              e.target.style.color = DESIGN_SYSTEM.colors.neutral[600]
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onSave({
              percentage: damagePercentage,
              description: description.trim(),
              color: getDamageColor(damagePercentage),
              label: getDamageLabel(damagePercentage)
            })}
            style={{
              padding: `${DESIGN_SYSTEM.spacing.md} ${DESIGN_SYSTEM.spacing['2xl']}`,
              backgroundColor: DESIGN_SYSTEM.colors.error[600],
              color: 'white',
              border: 'none',
              borderRadius: DESIGN_SYSTEM.borderRadius.lg,
              cursor: 'pointer',
              fontSize: DESIGN_SYSTEM.typography.fontSize.sm,
              fontWeight: DESIGN_SYSTEM.typography.fontWeight.semibold,
              fontFamily: DESIGN_SYSTEM.typography.fontFamily,
              transition: DESIGN_SYSTEM.animation.hover,
              boxShadow: DESIGN_SYSTEM.shadow.md,
              minWidth: '140px'
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = DESIGN_SYSTEM.colors.error[700]
              e.target.style.transform = 'translateY(-1px)'
              e.target.style.boxShadow = DESIGN_SYSTEM.shadow.lg
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = DESIGN_SYSTEM.colors.error[600]
              e.target.style.transform = 'translateY(0)'
              e.target.style.boxShadow = DESIGN_SYSTEM.shadow.md
            }}
          >
            {existingAnomaly ? 'Update Anomaly' : 'Create Anomaly'}
          </button>
        </div>
      </div>
    </div>
  )
})

// Utility function to map emoji icon names to SVG React elements
const getMenuIconSVG = (icon) => {
  switch (icon) {
    case '⛶':
      return (<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M4 8V4h4M16 4h4v4M4 16v4h4M16 20h4v-4"/></svg>);
    case '📏':
      return (<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 21L3 3M21 3l-18 18"/></svg>);
    case '📦': // Box/compartment
      return (<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>);
    case '👁️': // Eye
    case '👁️‍🗨️':
      return (<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>);
    case '🔧': // Wrench
      return (<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M22 2l-7 7m-2 2l-7 7m2-2l7-7"/></svg>);
    case '✏️': // Edit
      return (<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19.5 3 21l1.5-4L16.5 3.5z"/></svg>);
    case '🗑️': // Trash
      return (<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>);
    case '🎭': // Mask/theater
      return (<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 22c4.418 0 8-4.03 8-9V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8c0 4.97 3.582 9 8 9z"/><path d="M8 10h.01M16 10h.01"/></svg>);
    case '🔙': // Back arrow
      return (<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7"/></svg>);
    case '⚠️': // Warning
      return (<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 9v4m0 4h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>);
    case '📋': // List/report
      return (<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M4 7h16M4 7v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7"/></svg>);
    case '🧹': // Broom/clear
      return (<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2z"/><path d="M9 17v-6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6"/></svg>);
    default:
      return null;
  }
};

const ContextMenu = React.memo(({ position, visible, selectedCompartment, selectedPart,
    viewMode, onClose, onAction, anomalies }) => {
    if (!visible) return null;

    const isPartSelected = !!(selectedPart && typeof selectedPart === 'string');
    const hasAnomaly = isPartSelected && anomalies?.has(selectedPart);

    // Build menu based on current view
    let title, subtitle, menuItems;

    if (viewMode === 'asset') {
        title = 'Asset View';
        subtitle = selectedCompartment?.replace(/_/g, ' ') || 'No selection';
        menuItems = selectedCompartment ? [
            { label: 'Compartment View', action: 'compartmentView', icon: '📦' },
            { label: 'Fit To Screen',    action: 'fitToScreen',     icon: '🔲' },
            { label: 'Hide',             action: 'hide',            icon: '👁️' },
        ] : [
            { label: 'Fit To Screen',    action: 'fitToScreen',     icon: '🔲' },
        ];

    } else if (viewMode === 'compartment') {
        title = 'Compartment View';
        subtitle = isPartSelected
            ? selectedPart.split('-').slice(1).join('-')
            : selectedCompartment?.replace(/_/g, ' ') || '';
        menuItems = [
            { label: 'Asset View',    action: 'backToAsset',    icon: '🚢' },
            { label: 'Hullpart View', action: 'hullPartView',   icon: '🔧' },
            { label: 'Fit To Screen', action: 'fitToScreen',    icon: '🔲' },
            hasAnomaly
                ? { label: 'Edit Anomaly',   action: 'editAnomaly',   icon: '✏️' }
                : { label: 'Anomaly',        action: 'createAnomaly', icon: '⚠️' },
            { label: 'Hide',          action: 'hide',           icon: '👁️' },
        ];

    } else {
        title = 'Hullpart View';
        subtitle = isPartSelected
            ? selectedPart.split('-').slice(1).join('-')
            : '';
        menuItems = [
            { label: 'Asset View',       action: 'backToAsset',       icon: '🚢' },
            { label: 'Compartment View', action: 'backToCompartment', icon: '📦' },
            { label: 'Fit To Screen',    action: 'fitToScreen',       icon: '🔲' },
            hasAnomaly
                ? { label: 'Edit Anomaly', action: 'editAnomaly',   icon: '✏️' }
                : { label: 'Anomaly',      action: 'createAnomaly', icon: '⚠️' },
            { label: 'Hide',             action: 'hide',              icon: '👁️' },
        ];
    }

    return (
        <div style={{
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
            animation: 'contextMenuSlideIn 0.12s ease-out'
        }}>
            {/* Header */}
            <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid #f0f0f0' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#2196F3',
                    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 }}>
                    {title}
                </div>
                <div style={{ fontSize: 12, color: '#888', fontWeight: 500 }}>
                    {subtitle}
                </div>
            </div>

            {/* Items */}
            <div style={{ padding: '6px 0' }}>
                {menuItems.map((item, i) => (
                    <div
                        key={i}
                        onClick={() => { onAction(item.action); onClose(); }}
                        style={{
                            padding: '10px 16px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            fontSize: 13,
                            fontWeight: 500,
                            color: '#222',
                            transition: 'background 0.12s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f5f8ff'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                        <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>
                            {getMenuIconSVG(item.icon) || item.icon}
                        </span>
                        {item.label}
                    </div>
                ))}
            </div>
        </div>
    );
});
const HierarchicalSidebar = React.memo(({
  shipData,
  loadedCompartments,
  loadingPhase,
  isLoading,
  selectedCompartment,
  selectedPart,
  onCompartmentSelect,
  hiddenParts,
  onShowAll,
  topOffset = 0,
  compartmentVisibility,
  onToggleCompartment,
  onTogglePartVisibility
}) => {
  const [expandedFuncs, setExpandedFuncs] = useState(new Set())
  const [expandedComps, setExpandedComps] = useState(new Set())
  const [search, setSearch] = useState('')

  const getFunctionalityGroup = (name) => {
    const upper = name.toUpperCase()
    if (/^CARGO_TANK/.test(upper)) return 'CARGO TANK'
    if (/^AFT_PEAK/.test(upper)) return 'AFT PEAK'
    if (/^FORE_PEAK/.test(upper)) return 'FORE PEAK'
    if (/^ENGINE_ROOM/.test(upper)) return 'ENGINE ROOM'
    if (/^CHAIN_LOCKER/.test(upper)) return 'CHAIN LOCKER'
    if (/^DISTILLED_WATER/.test(upper)) return 'DISTILLED WATER'
    if (/^FWD_DEEP/.test(upper)) return 'FWD DEEP'
    if (/^POTABLE_WATER/.test(upper)) return 'POTABLE WATER'
    if (/^PUMP_ROOM/.test(upper)) return 'PUMP ROOM'
    if (/^SLOP_TANK/.test(upper)) return 'SLOP TANK'
    if (/^STEERING_GEAR/.test(upper)) return 'STEERING GEAR'
    if (/^STERN_TB/.test(upper)) return 'STERN TB'
    if (/^STORAGE_SPACES/.test(upper)) return 'STORAGE SPACES'
    return upper.replace(/_/g, ' ')
  }

  const getFunctionalityIcon = (groupName) => {
    if (groupName.includes('PEAK')) return 'anchor'
    if (groupName.includes('WATER') || groupName.includes('TANK') || groupName.includes('TB')) return 'drop'
    if (groupName.includes('LOCKER')) return 'link'
    if (groupName.includes('ROOM')) return 'room'
    if (groupName.includes('GEAR')) return 'gear'
    if (groupName.includes('DEEP') || groupName.includes('STORAGE')) return 'cube'
    return 'dot'
  }

  const renderFunctionalityIcon = (groupName) => {
    const icon = getFunctionalityIcon(groupName)
    const commonProps = {
      width: '16',
      height: '16',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: '#77b3ff',
      strokeWidth: '1.8',
      strokeLinecap: 'round',
      strokeLinejoin: 'round'
    }

    if (icon === 'anchor') {
      return (
        <svg {...commonProps}>
          <path d="M12 3v6" />
          <circle cx="12" cy="4" r="1.5" />
          <path d="M6 12a6 6 0 0 0 12 0" />
          <path d="M6 12H3m18 0h-3" />
        </svg>
      )
    }

    if (icon === 'drop') {
      return (
        <svg {...commonProps}>
          <path d="M12 3s-5 5.5-5 9a5 5 0 0 0 10 0c0-3.5-5-9-5-9z" />
        </svg>
      )
    }

    if (icon === 'link') {
      return (
        <svg {...commonProps}>
          <path d="M10 13a4 4 0 0 1 0-6l2-2a4 4 0 1 1 6 6l-1.5 1.5" />
          <path d="M14 11a4 4 0 0 1 0 6l-2 2a4 4 0 1 1-6-6L7.5 11.5" />
        </svg>
      )
    }

    if (icon === 'room') {
      return (
        <svg {...commonProps}>
          <path d="M3 18h18" />
          <path d="M4 18V9l8-5 8 5v9" />
          <path d="M9 18v-4h6v4" />
        </svg>
      )
    }

    if (icon === 'gear') {
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1.7 1.7 0 0 1-2.4 2.4l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1.7 1.7 0 0 1-3.4 0v-.1a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1.7 1.7 0 0 1-2.4-2.4l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a1.7 1.7 0 0 1 0-3.4h.1a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1.7 1.7 0 0 1 2.4-2.4l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a1.7 1.7 0 0 1 3.4 0v.1a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1.7 1.7 0 0 1 2.4 2.4l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a1.7 1.7 0 0 1 0 3.4h-.1a1 1 0 0 0-.5 1.7z" />
        </svg>
      )
    }

    if (icon === 'cube') {
      return (
        <svg {...commonProps}>
          <path d="M12 3l8 4.5v9L12 21 4 16.5v-9L12 3z" />
          <path d="M12 21v-9" />
          <path d="M20 7.5l-8 4.5L4 7.5" />
        </svg>
      )
    }

    return (
      <svg {...commonProps}>
        <circle cx="12" cy="12" r="2.4" />
      </svg>
    )
  }

  const grouped = useMemo(() => {
    const allCompartments = new Set()
    ;['plates', 'shells', 'brackets', 'stiffeners'].forEach((type) => {
      ;(shipData?.[type] || []).forEach((item) => {
        if (item?.compartmentName) allCompartments.add(item.compartmentName)
      })
    })

    const byFunction = {}
    Array.from(allCompartments).forEach((compartmentName) => {
      const func = getFunctionalityGroup(compartmentName)
      if (!byFunction[func]) byFunction[func] = []
      byFunction[func].push(compartmentName)
    })

    return Object.keys(byFunction)
      .sort()
      .map((name) => ({
        name,
        compartments: byFunction[name].sort()
      }))
  }, [shipData])

  const hullPartsByCompartment = useMemo(() => {
    const partsMap = {}
    Object.entries(loadedCompartments || {}).forEach(([compartmentName, compartmentData]) => {
      const parts = new Set()
      Object.values(compartmentData?.loadedComponents || {}).forEach((component) => {
        ;(component?.meshes || []).forEach((mesh) => {
          if (mesh?.name) parts.add(mesh.name)
        })
      })
      partsMap[compartmentName] = Array.from(parts).sort((a, b) => a.localeCompare(b))
    })
    return partsMap
  }, [loadedCompartments])

  const filteredGroups = useMemo(() => {
    const q = search.trim().toUpperCase()
    return grouped
      .map((g) => ({
        ...g,
        compartments: q
          ? g.compartments.filter((c) => c.toUpperCase().includes(q) || g.name.includes(q))
          : g.compartments
      }))
      .filter((g) => g.compartments.length > 0)
  }, [grouped, search])

  const toggleFunc = (name) => {
    setExpandedFuncs((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const toggleComp = (name) => {
    setExpandedComps((prev) => {
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
        top: `${topOffset}px`,
        left: 0,
        width: '390px',
        height: `calc(100vh - ${topOffset}px)`,
        background: '#001b37',
        borderRight: '1px solid rgba(255,255,255,0.08)',
        color: 'rgba(255,255,255,0.92)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1000
      }}
    >
      <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 800, letterSpacing: 0.8, fontSize: 12 }}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z" />
          </svg>
          <span style={{ fontSize: 12, lineHeight: 1.1 }}>LIST OF FUNCTIONALITIES</span>
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
              fontSize: 24,
              lineHeight: 1
            }}
            title="Show all"
          >
            {'\u00AB'}
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
            padding: '9px 12px'
          }}
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'rgba(255,255,255,0.7)' }}>
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            style={{
              width: '100%',
              border: 0,
              outline: 0,
              background: 'transparent',
              color: 'rgba(255,255,255,0.95)',
              fontSize: 15
            }}
          />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px 20px' }}>
        {filteredGroups.map((group) => {
          const funcExpanded = expandedFuncs.has(group.name)
          return (
            <div key={group.name}>
              <div
                onClick={() => toggleFunc(group.name)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '13px 10px',
                  cursor: 'pointer',
                  borderBottom: '1px solid rgba(255,255,255,0.08)',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: 0.2
                }}
              >
                <span style={{ width: 18, display: 'inline-flex', justifyContent: 'center' }}>
                  {renderFunctionalityIcon(group.name)}
                </span>
                <span style={{ fontSize: 13, flex: 1 }}>{group.name}</span>
                <span style={{ color: '#6ea8ea', fontSize: 16 }}>{funcExpanded ? '⌄' : '›'}</span>
              </div>

              {funcExpanded && (
                <div style={{ marginTop: 8, marginLeft: 8 }}>
                  <div style={{ fontSize: 10, letterSpacing: 0.6, color: 'rgba(255,255,255,0.62)', marginBottom: 6 }}>
                    LIST OF COMPARTMENTS
                  </div>
                  {group.compartments.map((compartmentName) => {
                    const compExpanded = expandedComps.has(compartmentName)
                    const isVisible = compartmentVisibility?.[compartmentName] !== false
                    const isSelected = selectedCompartment === compartmentName
                    const hullParts = hullPartsByCompartment[compartmentName] || []
                    return (
                      <div key={compartmentName} style={{ marginBottom: 6 }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '8px 8px',
                            borderRadius: 6,
                            background: isSelected ? 'rgba(26,135,201,0.20)' : 'rgba(255,255,255,0.03)',
                            border: isSelected ? '1px solid rgba(26,135,201,0.7)' : '1px solid rgba(255,255,255,0.10)'
                          }}
                        >
                          <span onClick={() => toggleComp(compartmentName)} style={{ cursor: 'pointer', fontSize: 12 }}>
                            {compExpanded ? '▼' : '▶'}
                          </span>
                          <span
                            onClick={() => onCompartmentSelect(compartmentName, null, null, false, null)}
                            style={{ flex: 1, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
                          >
                            {compartmentName.replace(/_/g, ' ')}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              onToggleCompartment?.(compartmentName)
                            }}
                            title={isVisible ? 'Hide compartment' : 'Show compartment'}
                            style={{
                              border: '1px solid rgba(255,255,255,0.18)',
                              borderRadius: 4,
                              background: 'transparent',
                              color: 'inherit',
                              cursor: 'pointer',
                              width: 24,
                              height: 22
                            }}
                          >
                            {isVisible ? '👁' : '🚫'}
                          </button>
                        </div>

                        {compExpanded && (
                          <div style={{ marginTop: 6, marginLeft: 14 }}>
                            <div style={{ fontSize: 10, letterSpacing: 0.6, color: 'rgba(255,255,255,0.58)', marginBottom: 4 }}>
                              LIST OF HULLPARTS
                            </div>
                            {hullParts.length === 0 && !(loadedCompartments && loadedCompartments[compartmentName]) && (
                              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.56)', padding: '4px 6px' }}>
                                Loading hullparts...
                              </div>
                            )}
                            {hullParts.length === 0 && loadedCompartments && loadedCompartments[compartmentName] && (
                              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.56)', padding: '4px 6px' }}>
                                No hullparts found
                              </div>
                            )}
                            {hullParts.map((meshName) => {
                              const partId = `${compartmentName}-${meshName}`
                              const hidden = hiddenParts?.has(partId)
                              const partSelected = selectedPart === partId
                              return (
                                <div
                                  key={partId}
                                  onClick={() => onCompartmentSelect(compartmentName, partId, null, false, null)}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '6px 6px',
                                    borderRadius: 5,
                                    cursor: 'pointer',
                                    background: partSelected ? 'rgba(26,135,201,0.18)' : 'transparent'
                                  }}
                                >
                                  <span style={{ fontSize: 11 }}>▣</span>
                                  <span style={{ flex: 1, fontSize: 11, color: hidden ? 'rgba(255,255,255,0.48)' : 'rgba(255,255,255,0.84)' }}>
                                    {meshName.replace(/_/g, ' ')}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      onTogglePartVisibility?.(partId)
                                    }}
                                    style={{
                                      border: '1px solid rgba(255,255,255,0.18)',
                                      borderRadius: 4,
                                      background: 'transparent',
                                      color: 'inherit',
                                      cursor: 'pointer',
                                      width: 24,
                                      height: 22
                                    }}
                                    title={hidden ? 'Show part' : 'Hide part'}
                                  >
                                    {hidden ? '🚫' : '👁'}
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
export { AnomalyListDialog, AnomalyDialog, ContextMenu, HierarchicalSidebar };
