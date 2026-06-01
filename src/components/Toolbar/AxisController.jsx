import React, { useState } from 'react';
import { animateCameraAngle } from '../../services/cameraService';

const AXIS_VIEWS = [
    { label: '+Y', title: 'Top', alpha: -Math.PI / 2, beta: 0.01 },
    { label: '−Y', title: 'Bottom', alpha: -Math.PI / 2, beta: Math.PI - 0.01 },
    { label: '+Z', title: 'Front', alpha: -Math.PI / 2, beta: Math.PI / 2 },
    { label: '−Z', title: 'Back', alpha: Math.PI / 2, beta: Math.PI / 2 },
    { label: '+X', title: 'Right', alpha: 0, beta: Math.PI / 2 },
    { label: '−X', title: 'Left', alpha: Math.PI, beta: Math.PI / 2 },
    { label: '⟳', title: 'Iso', alpha: -Math.PI / 4, beta: Math.PI / 3 },
];

const STEP = Math.PI / 12;

const AxisController = ({ sceneRef }) => {
    const snapTo = (alpha, beta) => {
        const cam = sceneRef.current?.activeCamera;
        if (cam) animateCameraAngle(cam, sceneRef.current, alpha, beta);
    };

    const rotate = (dAlpha, dBeta) => {
        const cam = sceneRef.current?.activeCamera;
        if (!cam) return;
        const nextAlpha = cam.alpha + dAlpha * STEP;
        const nextBeta = Math.max(0.01, Math.min(Math.PI - 0.01, cam.beta + dBeta * STEP));
        animateCameraAngle(cam, sceneRef.current, nextAlpha, nextBeta);
    };

    const panel = {
        position: 'fixed', bottom: 24, right: 24, zIndex: 2000,
        display: 'flex', flexDirection: 'column', gap: 6, userSelect: 'none',
    };
    const group = {
        display: 'flex', flexDirection: 'column',
        background: 'rgba(18,28,40,0.88)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 10, overflow: 'hidden', backdropFilter: 'blur(8px)',
    };
    const rowStyle = { display: 'flex' };
    const btnBase = {
        width: 46, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, letterSpacing: '0.02em', cursor: 'pointer',
        color: 'rgba(200,220,255,0.85)', background: 'transparent', border: 'none',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        transition: 'background 0.12s, color 0.12s',
        fontFamily: 'system-ui, sans-serif',
    };

    const Btn = ({ onClick, title, children, style = {} }) => {
        const [hov, setHov] = useState(false);
        return (
            <button
                onClick={onClick} title={title}
                style={{
                    ...btnBase, ...style,
                    background: hov ? 'rgba(77,162,255,0.18)' : 'transparent',
                    color: hov ? '#7dd4fc' : 'rgba(200,220,255,0.85)',
                }}
                onMouseEnter={() => setHov(true)}
                onMouseLeave={() => setHov(false)}
            >
                {children}
            </button>
        );
    };

    const label = {
        padding: '4px 0 2px', textAlign: 'center', fontSize: 9, fontWeight: 600,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'rgba(150,180,220,0.5)', fontFamily: 'system-ui, sans-serif',
    };

    return (
        <div style={panel}>
            <div style={group}>
                <div style={label}>Axis Views</div>
                <div style={rowStyle}>
                    <Btn onClick={() => snapTo(AXIS_VIEWS[0].alpha, AXIS_VIEWS[0].beta)} title="Top (+Y)">Top</Btn>
                    <Btn onClick={() => snapTo(AXIS_VIEWS[1].alpha, AXIS_VIEWS[1].beta)} title="Bottom (−Y)">Bot</Btn>
                    <Btn onClick={() => snapTo(AXIS_VIEWS[6].alpha, AXIS_VIEWS[6].beta)} title="Isometric" style={{ borderRight: 'none' }}>Iso</Btn>
                </div>
                <div style={rowStyle}>
                    <Btn onClick={() => snapTo(AXIS_VIEWS[2].alpha, AXIS_VIEWS[2].beta)} title="Front (+Z)">Frt</Btn>
                    <Btn onClick={() => snapTo(AXIS_VIEWS[3].alpha, AXIS_VIEWS[3].beta)} title="Back (−Z)">Bck</Btn>
                    <Btn onClick={() => snapTo(AXIS_VIEWS[4].alpha, AXIS_VIEWS[4].beta)} title="Right (+X)" style={{ borderRight: 'none' }}>Rgt</Btn>
                </div>
                <div style={rowStyle}>
                    <Btn onClick={() => snapTo(AXIS_VIEWS[5].alpha, AXIS_VIEWS[5].beta)} title="Left (−X)" style={{ borderBottom: 'none' }}>Lft</Btn>
                </div>
            </div>

            <div style={group}>
                <div style={label}>Rotate</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 46px)', gridTemplateRows: 'repeat(3, 34px)' }}>
                    <Btn onClick={() => rotate(-1, -1)} title="Rotate Up-Left">↖</Btn>
                    <Btn onClick={() => rotate(0, -1)} title="Tilt Up">↑</Btn>
                    <Btn onClick={() => rotate(1, -1)} title="Rotate Up-Right" style={{ borderRight: 'none' }}>↗</Btn>

                    <Btn onClick={() => rotate(-1, 0)} title="Rotate Left">←</Btn>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.1)', borderRight: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>•</div>
                    <Btn onClick={() => rotate(1, 0)} title="Rotate Right" style={{ borderRight: 'none' }}>→</Btn>

                    <Btn onClick={() => rotate(-1, 1)} title="Rotate Down-Left" style={{ borderBottom: 'none' }}>↙</Btn>
                    <Btn onClick={() => rotate(0, 1)} title="Tilt Down" style={{ borderBottom: 'none' }}>↓</Btn>
                    <Btn onClick={() => rotate(1, 1)} title="Rotate Down-Right" style={{ borderRight: 'none', borderBottom: 'none' }}>↘</Btn>
                </div>
            </div>
        </div>
    );
};

export default AxisController;
