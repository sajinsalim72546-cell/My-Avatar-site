import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Mail, FileText, X, Sparkles, Code2, Globe, Cpu, Compass } from 'lucide-react';

const BG_HEX = '#e51b01'; // Exact background detected from video
const TOTAL_FRAMES = 64;
const LERP_FACTOR = 0.26; // Ultra-fast response factor (~35ms tracking)

// Shortest-path circular angular lerp
function lerpAngle(current, target, factor) {
  let diff = (target - current) % (2 * Math.PI);
  if (diff > Math.PI) diff -= 2 * Math.PI;
  if (diff < -Math.PI) diff += 2 * Math.PI;
  return current + diff * factor;
}

export default function App() {
  const canvasRef = useRef(null);
  const [loadedPercent, setLoadedPercent] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [activeModal, setActiveModal] = useState(null);
  const [isHovered, setIsHovered] = useState(false);
  const [telemetry, setTelemetry] = useState({ deg: 0, dir: 'CENTER', deadzone: true });

  // Store preloaded images
  const framesRef = useRef([]);
  const centerImgRef = useRef(null);

  // Mouse & render tracking refs
  const mousePosRef = useRef({ x: window.innerWidth * 0.5, y: window.innerHeight * 0.33 });
  const facePosRef = useRef({ x: window.innerWidth * 0.5, y: window.innerHeight * 0.33 });
  const currentAngleRef = useRef(0);
  const inDeadzoneRef = useRef(true);

  // Custom cursor trailing coordinates
  const cursorDotRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const cursorRingRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const cursorDotEl = useRef(null);
  const cursorRingEl = useRef(null);

  // 1. Preload 64 frames + center.webp
  useEffect(() => {
    let loadedCount = 0;
    const totalToLoad = TOTAL_FRAMES + 1;
    const frames = [];

    const handleItemLoaded = () => {
      loadedCount++;
      const pct = Math.floor((loadedCount / totalToLoad) * 100);
      setLoadedPercent(pct);
      if (loadedCount >= totalToLoad) {
        setIsLoaded(true);
      }
    };

    // Preload center.webp
    const centerImg = new Image();
    centerImg.src = '/center.webp';
    centerImg.onload = handleItemLoaded;
    centerImg.onerror = () => {
      // Fallback if not loaded
      console.warn('Fallback loading center image');
      handleItemLoaded();
    };
    centerImgRef.current = centerImg;

    // Preload 64 frames
    for (let i = 0; i < TOTAL_FRAMES; i++) {
      const img = new Image();
      img.src = `/frames/${i}.webp`;
      img.onload = handleItemLoaded;
      img.onerror = () => {
        console.warn(`Fallback frame ${i}`);
        handleItemLoaded();
      };
      frames.push(img);
    }
    framesRef.current = frames;
  }, []);

  // 2. Mouse Tracking & Window Resize
  useEffect(() => {
    const handleMouseMove = (e) => {
      mousePosRef.current = { x: e.clientX, y: e.clientY };
      cursorDotRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // 3. 60 FPS Canvas Render Loop (Zero Ghosting, Exactly 1 Crisp Frame)
  useEffect(() => {
    let animId;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        animId = requestAnimationFrame(render);
        return;
      }

      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) {
        animId = requestAnimationFrame(render);
        return;
      }

      const canvasW = canvas.width;
      const canvasH = canvas.height;
      const imgW = 1280;
      const imgH = 720;

      // Calculate object-fit: cover scaling
      const scale = Math.max(canvasW / imgW, canvasH / imgH);
      const renderW = imgW * scale;
      const renderH = imgH * scale;
      const renderX = (canvasW - renderW) / 2;
      const renderY = (canvasH - renderH) / 2;

      // Face center in screen coordinates (center x=640 is 50%, face center y=290 is 40% of 720h)
      const faceX = renderX + renderW * 0.5;
      const faceY = renderY + renderH * 0.40;
      facePosRef.current = { x: faceX, y: faceY };

      // Vector from face center to cursor
      const dx = mousePosRef.current.x - faceX;
      const dy = mousePosRef.current.y - faceY;
      const dist = Math.hypot(dx, dy);

      // Deadzone threshold (~12% of screen dimension)
      const minDimension = Math.min(canvasW, canvasH);
      const deadzoneRadius = minDimension * 0.12;
      const isDeadzone = dist <= deadzoneRadius;
      inDeadzoneRef.current = isDeadzone;

      // Calculate target angle in radians [-PI, PI]
      const targetAngle = Math.atan2(dy, dx);

      // Smooth angle using shortest-path circular angular lerp
      currentAngleRef.current = lerpAngle(currentAngleRef.current, targetAngle, LERP_FACTOR);

      // Normalize smoothed angle to [0, 2*PI)
      let normAngle = currentAngleRef.current % (2 * Math.PI);
      if (normAngle < 0) normAngle += 2 * Math.PI;

      // Map smoothed angle to nearest frame index (0..63)
      const frameIdx = Math.round((normAngle / (2 * Math.PI)) * TOTAL_FRAMES) % TOTAL_FRAMES;

      // Choose EXACTLY ONE crisp frame to draw at 100% opacity (no alpha blending!)
      let activeImage = null;
      if (isDeadzone) {
        activeImage = centerImgRef.current;
      } else {
        activeImage = framesRef.current[frameIdx];
      }

      // Draw background seamless hex color
      ctx.fillStyle = BG_HEX;
      ctx.fillRect(0, 0, canvasW, canvasH);

      // Draw active frame if loaded
      if (activeImage && activeImage.complete && activeImage.naturalWidth > 0) {
        ctx.drawImage(activeImage, renderX, renderY, renderW, renderH);
      } else if (centerImgRef.current && centerImgRef.current.complete) {
        ctx.drawImage(centerImgRef.current, renderX, renderY, renderW, renderH);
      }

      // Telemetry calculation for luxury dashboard indicator
      const deg = Math.round((normAngle * 180) / Math.PI);
      let compassName = 'RIGHT';
      if (deg >= 23 && deg < 68) compassName = 'DOWN-RIGHT';
      else if (deg >= 68 && deg < 113) compassName = 'DOWN';
      else if (deg >= 113 && deg < 158) compassName = 'DOWN-LEFT';
      else if (deg >= 158 && deg < 203) compassName = 'LEFT';
      else if (deg >= 203 && deg < 248) compassName = 'UP-LEFT';
      else if (deg >= 248 && deg < 293) compassName = 'UP';
      else if (deg >= 293 && deg < 338) compassName = 'UP-RIGHT';

      // Update telemetry state smoothly
      if (Math.random() < 0.2) {
        setTelemetry({
          deg,
          dir: isDeadzone ? 'DIRECT EYE CONTACT' : compassName,
          deadzone: isDeadzone
        });
      }

      // Update custom magnetic cursor smooth trailing
      cursorRingRef.current.x += (mousePosRef.current.x - cursorRingRef.current.x) * 0.18;
      cursorRingRef.current.y += (mousePosRef.current.y - cursorRingRef.current.y) * 0.18;

      if (cursorDotEl.current) {
        cursorDotEl.current.style.transform = `translate3d(${cursorDotRef.current.x}px, ${cursorDotRef.current.y}px, 0) translate(-50%, -50%)`;
      }
      if (cursorRingEl.current) {
        cursorRingEl.current.style.transform = `translate3d(${cursorRingRef.current.x}px, ${cursorRingRef.current.y}px, 0) translate(-50%, -50%)`;
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, []);

  const handleInteractiveEnter = () => setIsHovered(true);
  const handleInteractiveLeave = () => setIsHovered(false);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* 1. Loading Screen */}
      <div className={`loader-overlay ${isLoaded ? 'fade-out' : ''}`}>
        <div className="loader-name">Sajin</div>
        <div className="loader-progress-track">
          <div className="loader-progress-bar" style={{ width: `${loadedPercent}%` }} />
        </div>
        <div className="loader-percent">CALIBRATING 60FPS HEAD POSE TRAJECTORY • {loadedPercent}%</div>
      </div>

      {/* 2. Fullscreen Canvas */}
      <canvas ref={canvasRef} className="hero-canvas" />

      {/* 3. Top-Left Brand Monogram */}
      <div className="brand-monogram">
        <span>SAJIN</span>
        <div className="brand-dot" />
        <span style={{ opacity: 0.65, fontWeight: 400 }}>PORTFOLIO</span>
      </div>

      {/* 4. Top-Right Availability Status Badge */}
      <div className="status-badge">
        <div className="pulse-dot" />
        <span>AVAILABLE FOR Q4 PROJECTS</span>
      </div>

      {/* 5. Floating Frosted-Glass Navigation Pill */}
      <header className="nav-pill">
        <button
          className={`nav-item ${activeModal === 'work' ? 'active' : ''}`}
          onClick={() => setActiveModal('work')}
          onMouseEnter={handleInteractiveEnter}
          onMouseLeave={handleInteractiveLeave}
        >
          [WORK]
        </button>
        <button
          className={`nav-item ${activeModal === 'about' ? 'active' : ''}`}
          onClick={() => setActiveModal('about')}
          onMouseEnter={handleInteractiveEnter}
          onMouseLeave={handleInteractiveLeave}
        >
          [ABOUT]
        </button>
        <button
          className={`nav-item ${activeModal === 'contact' ? 'active' : ''}`}
          onClick={() => setActiveModal('contact')}
          onMouseEnter={handleInteractiveEnter}
          onMouseLeave={handleInteractiveLeave}
        >
          [CONTACT]
        </button>
      </header>

      {/* 6. Hero Typography (Bottom-Left) */}
      <main className="hero-content">
        <div className="hero-subtitle">Hi, I'm</div>
        <h1 className="hero-name">Sajin</h1>
        <p className="hero-bio">
          Crafting ultra-responsive digital architectures and bespoke web experiences. Blending
          high-performance engineering with luxury creative direction.
        </p>
        <div className="hero-actions">
          <button
            className="btn-primary"
            onClick={() => setActiveModal('resume')}
            onMouseEnter={handleInteractiveEnter}
            onMouseLeave={handleInteractiveLeave}
          >
            <span>Resume</span>
            <ArrowUpRight size={16} strokeWidth={2.4} />
          </button>
          <button
            className="btn-secondary"
            onClick={() => setActiveModal('contact')}
            onMouseEnter={handleInteractiveEnter}
            onMouseLeave={handleInteractiveLeave}
          >
            <span>Let's Talk</span>
          </button>
        </div>
      </main>

      {/* 7. Bottom-Right Interactive Angle / Pose Telemetry */}
      <aside className="angle-indicator">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Compass size={13} style={{ opacity: 0.8 }} />
          <span>{telemetry.deadzone ? 'EYE CONTACT LOCK' : `BEARING ${telemetry.deg}°`}</span>
        </div>
        <div className="angle-val">{telemetry.dir}</div>
      </aside>

      {/* 8. Custom Magnetic Cursor */}
      <div ref={cursorDotEl} className="custom-cursor-dot" />
      <div
        ref={cursorRingEl}
        className={`custom-cursor-ring ${isHovered ? 'hovered' : ''} ${telemetry.deadzone ? 'deadzone' : ''}`}
      />

      {/* 9. Interactive Modals */}
      {activeModal && (
        <div className="modal-backdrop" onClick={() => setActiveModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close-btn"
              onClick={() => setActiveModal(null)}
              onMouseEnter={handleInteractiveEnter}
              onMouseLeave={handleInteractiveLeave}
            >
              <X size={18} />
            </button>

            {activeModal === 'work' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                  <Code2 size={24} color="#ffffff" />
                  <h2 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Selected Works</h2>
                </div>
                <p style={{ opacity: 0.8, fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '20px' }}>
                  A curated selection of luxury digital platforms, interactive 3D WebGL experiences, and high-throughput systems.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ padding: '14px 18px', background: 'rgba(255,255,255,0.06)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ fontWeight: 600, fontSize: '1rem', color: '#fff' }}>Aura Luxury Editorial</div>
                    <div style={{ fontSize: '0.82rem', opacity: 0.75, marginTop: '2px' }}>Next.js 15 • Three.js • 60 FPS Interactive Canvas</div>
                  </div>
                  <div style={{ padding: '14px 18px', background: 'rgba(255,255,255,0.06)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ fontWeight: 600, fontSize: '1rem', color: '#fff' }}>Synapse Analytics Engine</div>
                    <div style={{ fontSize: '0.82rem', opacity: 0.75, marginTop: '2px' }}>React • WebAssembly • Distributed Real-Time Stream</div>
                  </div>
                  <div style={{ padding: '14px 18px', background: 'rgba(255,255,255,0.06)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ fontWeight: 600, fontSize: '1rem', color: '#fff' }}>Prism Design System</div>
                    <div style={{ fontSize: '0.82rem', opacity: 0.75, marginTop: '2px' }}>Multi-Brand Component Architecture • Micro-Interactions</div>
                  </div>
                </div>
              </div>
            )}

            {activeModal === 'about' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                  <Sparkles size={24} color="#ffffff" />
                  <h2 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>About Sajin</h2>
                </div>
                <p style={{ opacity: 0.9, fontSize: '0.92rem', lineHeight: 1.65, marginBottom: '14px' }}>
                  Senior Full Stack Developer and Creative Technologist specializing in crafting ultra-responsive web applications, zero-latency canvas renderers, and bespoke brand interactions.
                </p>
                <p style={{ opacity: 0.75, fontSize: '0.86rem', lineHeight: 1.6 }}>
                  With deep expertise spanning modern frontend frameworks, GPU-accelerated canvas pipelines, and scalable cloud architectures, I bridge the gap between rigorous technical precision and emotional visual impact.
                </p>
              </div>
            )}

            {activeModal === 'contact' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                  <Mail size={24} color="#ffffff" />
                  <h2 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Let's Connect</h2>
                </div>
                <p style={{ opacity: 0.8, fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '20px' }}>
                  Have an ambitious project or want to collaborate on building an exceptional digital experience? Let's discuss your vision.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <a
                    href="mailto:contact@sajin.dev"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 18px',
                      background: 'rgba(255,255,255,0.08)',
                      borderRadius: '14px',
                      color: '#ffffff',
                      textDecoration: 'none',
                      border: '1px solid rgba(255,255,255,0.15)'
                    }}
                    onMouseEnter={handleInteractiveEnter}
                    onMouseLeave={handleInteractiveLeave}
                  >
                    <span>contact@sajin.dev</span>
                    <ArrowUpRight size={18} />
                  </a>
                  <a
                    href="https://github.com"
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 18px',
                      background: 'rgba(255,255,255,0.08)',
                      borderRadius: '14px',
                      color: '#ffffff',
                      textDecoration: 'none',
                      border: '1px solid rgba(255,255,255,0.15)'
                    }}
                    onMouseEnter={handleInteractiveEnter}
                    onMouseLeave={handleInteractiveLeave}
                  >
                    <span>github.com/sajin</span>
                    <ArrowUpRight size={18} />
                  </a>
                </div>
              </div>
            )}

            {activeModal === 'resume' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                  <FileText size={24} color="#ffffff" />
                  <h2 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Curriculum Vitae</h2>
                </div>
                <div style={{ opacity: 0.85, fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '20px' }}>
                  <div style={{ fontWeight: 600, color: '#fff', marginBottom: '4px' }}>Full Stack Engineer & Tech Lead</div>
                  <div style={{ opacity: 0.7, fontSize: '0.82rem', marginBottom: '12px' }}>7+ Years Experience • San Francisco, CA</div>
                  <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <li>Architected zero-lag canvas and WebGL graphics engines handling millions of monthly interactions.</li>
                    <li>Engineered enterprise full-stack distributed web applications in React, TypeScript, Node.js, and Python.</li>
                    <li>Designed luxury micro-interactions, responsive design systems, and award-winning user experiences.</li>
                  </ul>
                </div>
                <button
                  className="btn-primary"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => alert('Resume PDF downloaded!')}
                  onMouseEnter={handleInteractiveEnter}
                  onMouseLeave={handleInteractiveLeave}
                >
                  <span>Download Full PDF Resume</span>
                  <ArrowUpRight size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
