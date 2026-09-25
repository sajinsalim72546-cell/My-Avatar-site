import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Mail,
  Phone,
  FileText,
  X,
  Sparkles,
  Award,
  Briefcase,
  GraduationCap,
  CheckCircle2,
  Download,
  Compass,
  MapPin,
  TrendingUp,
  Users
} from 'lucide-react';

const BG_HEX = '#e51b01'; // Exact background detected from video
const TOTAL_FRAMES = 120; // High-density 120-frame continuous head rotation (3° per frame)
const LERP_FACTOR = 0.16; // Silky fluid momentum without lag

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
  const [resumeTab, setResumeTab] = useState('overview'); // 'overview' | 'pdf'
  const [isHovered, setIsHovered] = useState(false);
  const [telemetry, setTelemetry] = useState({ deg: 0, dir: 'CENTER', deadzone: true });

  // Store preloaded images
  const framesRef = useRef([]);
  const centerImgRef = useRef(null);

  // Mouse & render tracking refs
  const mousePosRef = useRef({ x: window.innerWidth * 0.5, y: window.innerHeight * 0.40 });
  const facePosRef = useRef({ x: window.innerWidth * 0.5, y: window.innerHeight * 0.40 });
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

  // 3. 60 FPS Canvas Render Loop (Zero Ghosting, Whole Head Rotates Crisp)
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

      // Deadzone with hysteresis to eliminate border jitter
      const minDimension = Math.min(canvasW, canvasH);
      const innerDeadzone = minDimension * 0.08;
      const outerDeadzone = minDimension * 0.14;

      if (inDeadzoneRef.current) {
        if (dist > outerDeadzone) {
          inDeadzoneRef.current = false;
        }
      } else {
        if (dist < innerDeadzone) {
          inDeadzoneRef.current = true;
        }
      }
      const isDeadzone = inDeadzoneRef.current;

      // Calculate target angle in radians [-PI, PI]
      const targetAngle = Math.atan2(dy, dx);

      // Smooth angle using shortest-path circular angular lerp
      currentAngleRef.current = lerpAngle(currentAngleRef.current, targetAngle, LERP_FACTOR);

      // Normalize smoothed angle to [0, 2*PI)
      let normAngle = currentAngleRef.current % (2 * Math.PI);
      if (normAngle < 0) normAngle += 2 * Math.PI;

      // Map smoothed angle to nearest frame index (0..63)
      const frameIdx = Math.round((normAngle / (2 * Math.PI)) * TOTAL_FRAMES) % TOTAL_FRAMES;

      // Choose EXACTLY ONE crisp frame to draw at 100% opacity
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

      // Telemetry calculation
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
        <div className="loader-percent">CALIBRATING 120-FRAME HEAD POSE TRAJECTORY • {loadedPercent}%</div>
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
        <span>CELL LEAD • TECHNICAL SUPPORT & OPS</span>
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
          Cell Lead and Operations Specialist dedicated to empowering technical support teams
          through leadership, coaching, client management, and cross-functional excellence.
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
          <div
            className={`modal-content ${activeModal === 'resume' ? 'resume-modal' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close-btn"
              onClick={() => setActiveModal(null)}
              onMouseEnter={handleInteractiveEnter}
              onMouseLeave={handleInteractiveLeave}
            >
              <X size={18} />
            </button>

            {/* WORK MODAL */}
            {activeModal === 'work' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                  <Briefcase size={24} color="#ffffff" />
                  <h2 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Selected Operations & Projects</h2>
                </div>
                <p style={{ opacity: 0.8, fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '20px' }}>
                  A track record of driving operational excellence, coaching high-performing teams, and optimizing SLA metrics.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ padding: '14px 18px', background: 'rgba(255,255,255,0.08)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.18)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 600, fontSize: '1rem', color: '#fff' }}>Cell Lead • Technical Support Operations</div>
                      <span style={{ fontSize: '0.72rem', background: '#ff4d36', color: '#fff', padding: '2px 8px', borderRadius: '9999px', fontWeight: 600 }}>CURRENT ROLE</span>
                    </div>
                    <div style={{ fontSize: '0.82rem', color: '#ffb3a7', marginTop: '2px' }}>Phykon Solutions Pvt Ltd (Promoted Feb 2026 – Present)</div>
                    <div style={{ fontSize: '0.82rem', opacity: 0.85, marginTop: '4px', lineHeight: 1.5 }}>
                      Full Technical Support Team Lead scope: managing team performance, client relations, engineering collaboration for bug resolutions, high-priority escalations, and cross-functional projects.
                    </div>
                  </div>
                  <div style={{ padding: '14px 18px', background: 'rgba(255,255,255,0.06)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ fontWeight: 600, fontSize: '1rem', color: '#fff' }}>Phykon Solutions Starlink & Atlas Workflows</div>
                    <div style={{ fontSize: '0.82rem', opacity: 0.75, marginTop: '2px' }}>
                      Senior Support Specialist (May 2025 – Feb 2026) • End-to-end ticket lifecycle, order placement, invoice transcription, and Starlink partner coordination.
                    </div>
                  </div>
                  <div style={{ padding: '14px 18px', background: 'rgba(255,255,255,0.06)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ fontWeight: 600, fontSize: '1rem', color: '#fff' }}>Allianz Partners Australia Operations</div>
                    <div style={{ fontSize: '0.82rem', opacity: 0.75, marginTop: '2px' }}>
                      Deputy / Acting Team Leader • Performance targets, team coaching, 1-on-1s, and EOD escalation handling.
                    </div>
                  </div>
                  <div style={{ padding: '14px 18px', background: 'rgba(255,255,255,0.06)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ fontWeight: 600, fontSize: '1rem', color: '#fff' }}>Call Center Quality & SLA Transformation</div>
                    <div style={{ fontSize: '0.82rem', opacity: 0.75, marginTop: '2px' }}>
                      Quality Champion (24 consecutive months) • SOP design for customer complaint handling and sales transfer rate optimization.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ABOUT MODAL */}
            {activeModal === 'about' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                  <Sparkles size={24} color="#ffffff" />
                  <h2 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>About Sajin</h2>
                </div>
                <div
                  style={{
                    padding: '16px 20px',
                    background: 'rgba(255,255,255,0.07)',
                    borderLeft: '4px solid #ffffff',
                    borderRadius: '0 14px 14px 0',
                    fontStyle: 'italic',
                    fontSize: '0.94rem',
                    lineHeight: 1.65,
                    color: 'rgba(255,255,255,0.95)',
                    marginBottom: '20px'
                  }}
                >
                  “I am passionate about managing and supervising the activities of the team by effective
                  Leadership, Coaching and Development. The last seven years of my work experience has
                  enriched me with traits required to contribute in a corporate environment and taught me
                  valuable skills giving me the confidence to take on challenges and overcome them”
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '16px' }}>
                  <div style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ fontSize: '0.72rem', letterSpacing: '0.1em', opacity: 0.6, textTransform: 'uppercase' }}>CURRENT ROLE</div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, marginTop: '4px' }}>Cell Lead (Phykon)</div>
                  </div>
                  <div style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ fontSize: '0.72rem', letterSpacing: '0.1em', opacity: 0.6, textTransform: 'uppercase' }}>FOCUS</div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, marginTop: '4px' }}>Tech Support Team Lead</div>
                  </div>
                  <div style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ fontSize: '0.72rem', letterSpacing: '0.1em', opacity: 0.6, textTransform: 'uppercase' }}>EXPERIENCE</div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, marginTop: '4px' }}>8+ Years Corporate</div>
                  </div>
                  <div style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ fontSize: '0.72rem', letterSpacing: '0.1em', opacity: 0.6, textTransform: 'uppercase' }}>HONORS</div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, marginTop: '4px' }}>Quality Champion (24M)</div>
                  </div>
                </div>
              </div>
            )}

            {/* CONTACT MODAL */}
            {activeModal === 'contact' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                  <Mail size={24} color="#ffffff" />
                  <h2 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Contact Sajin</h2>
                </div>
                <p style={{ opacity: 0.8, fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '20px' }}>
                  Feel free to get in touch directly via phone or email for leadership opportunities, team supervision, or operational discussions.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* Phone Option */}
                  <a
                    href="tel:+918075365541"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '16px 20px',
                      background: 'rgba(255,255,255,0.09)',
                      borderRadius: '16px',
                      color: '#ffffff',
                      textDecoration: 'none',
                      border: '1px solid rgba(255,255,255,0.2)',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={handleInteractiveEnter}
                    onMouseLeave={handleInteractiveLeave}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Phone size={20} color="#ffffff" />
                      </div>
                      <div>
                        <div style={{ fontSize: '0.72rem', opacity: 0.65, letterSpacing: '0.1em', textTransform: 'uppercase' }}>PHONE NUMBER</div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 600, letterSpacing: '0.02em', marginTop: '2px' }}>+91 8075365541</div>
                      </div>
                    </div>
                    <ArrowUpRight size={18} opacity={0.7} />
                  </a>

                  {/* Email Option */}
                  <a
                    href="mailto:sajinsalim72546@gmail.com"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '16px 20px',
                      background: 'rgba(255,255,255,0.09)',
                      borderRadius: '16px',
                      color: '#ffffff',
                      textDecoration: 'none',
                      border: '1px solid rgba(255,255,255,0.2)',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={handleInteractiveEnter}
                    onMouseLeave={handleInteractiveLeave}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Mail size={20} color="#ffffff" />
                      </div>
                      <div>
                        <div style={{ fontSize: '0.72rem', opacity: 0.65, letterSpacing: '0.1em', textTransform: 'uppercase' }}>EMAIL ADDRESS</div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 600, letterSpacing: '0.02em', marginTop: '2px' }}>sajinsalim72546@gmail.com</div>
                      </div>
                    </div>
                    <ArrowUpRight size={18} opacity={0.7} />
                  </a>

                  {/* Location Info */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      padding: '14px 20px',
                      background: 'rgba(255,255,255,0.04)',
                      borderRadius: '16px',
                      border: '1px solid rgba(255,255,255,0.08)'
                    }}
                  >
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <MapPin size={20} color="rgba(255,255,255,0.8)" />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.72rem', opacity: 0.65, letterSpacing: '0.1em', textTransform: 'uppercase' }}>LOCATION</div>
                      <div style={{ fontSize: '0.92rem', color: 'rgba(255,255,255,0.9)' }}>Saina Manzil, Karuvatta, Alappuzha, Kerala</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* RESUME MODAL */}
            {activeModal === 'resume' && (
              <div>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid rgba(255,255,255,0.15)', paddingBottom: '20px', marginBottom: '20px' }}>
                  <div>
                    <h2 style={{ fontSize: '2rem', fontWeight: 700, margin: 0, letterSpacing: '0.02em' }}>SAJIN SALIM</h2>
                    <div style={{ fontSize: '1.05rem', color: '#ffb3a7', fontWeight: 600, marginTop: '4px' }}>
                      Cell Lead (Technical Support) & Operations Specialist
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '14px', fontSize: '0.82rem', opacity: 0.75, marginTop: '8px' }}>
                      <span>+91 8075365541</span>
                      <span>•</span>
                      <span>sajinsalim72546@gmail.com</span>
                      <span>•</span>
                      <span>Alappuzha, Kerala</span>
                    </div>
                  </div>
                  <a
                    href="/resume.pdf"
                    download="Sajin_Salim_Resume.pdf"
                    className="btn-primary"
                    style={{ textDecoration: 'none', padding: '10px 20px', fontSize: '0.82rem' }}
                    onMouseEnter={handleInteractiveEnter}
                    onMouseLeave={handleInteractiveLeave}
                  >
                    <Download size={15} />
                    <span>Download PDF</span>
                  </a>
                </div>

                {/* Navigation Tabs */}
                <div style={{ display: 'flex', gap: '10px', marginBottom: '22px' }}>
                  <button
                    style={{
                      padding: '8px 18px',
                      borderRadius: '9999px',
                      border: '1px solid rgba(255,255,255,0.25)',
                      background: resumeTab === 'overview' ? '#ffffff' : 'rgba(255,255,255,0.08)',
                      color: resumeTab === 'overview' ? '#000000' : '#ffffff',
                      fontWeight: 600,
                      fontSize: '0.82rem',
                      outline: 'none',
                      transition: 'all 0.2s ease'
                    }}
                    onClick={() => setResumeTab('overview')}
                    onMouseEnter={handleInteractiveEnter}
                    onMouseLeave={handleInteractiveLeave}
                  >
                    Curriculum Vitae Overview
                  </button>
                  <button
                    style={{
                      padding: '8px 18px',
                      borderRadius: '9999px',
                      border: '1px solid rgba(255,255,255,0.25)',
                      background: resumeTab === 'pdf' ? '#ffffff' : 'rgba(255,255,255,0.08)',
                      color: resumeTab === 'pdf' ? '#000000' : '#ffffff',
                      fontWeight: 600,
                      fontSize: '0.82rem',
                      outline: 'none',
                      transition: 'all 0.2s ease'
                    }}
                    onClick={() => setResumeTab('pdf')}
                    onMouseEnter={handleInteractiveEnter}
                    onMouseLeave={handleInteractiveLeave}
                  >
                    View Original PDF Document
                  </button>
                </div>

                {resumeTab === 'pdf' ? (
                  <div>
                    <div style={{ width: '100%', height: '620px', borderRadius: '16px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.2)', marginBottom: '16px' }}>
                      <iframe
                        src="/resume.pdf#toolbar=1"
                        title="Sajin Salim Official Resume"
                        style={{ width: '100%', height: '100%', border: 'none' }}
                      />
                    </div>
                    <a
                      href="/resume.pdf"
                      download="SAJIN_SALIM_RESUME.pdf"
                      className="btn-primary"
                      style={{ width: '100%', justifyContent: 'center', textDecoration: 'none' }}
                      onMouseEnter={handleInteractiveEnter}
                      onMouseLeave={handleInteractiveLeave}
                    >
                      <Download size={16} />
                      <span>Download SAJIN SALIM_RESUME.pdf</span>
                    </a>
                  </div>
                ) : (
                  <div>
                    {/* Professional Summary */}
                    <div style={{ marginBottom: '24px' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', opacity: 0.6, marginBottom: '8px' }}>
                        EXECUTIVE SUMMARY
                      </div>
                      <p style={{ fontStyle: 'italic', fontSize: '0.92rem', lineHeight: 1.6, background: 'rgba(255,255,255,0.05)', padding: '14px 18px', borderRadius: '12px', borderLeft: '3px solid #ffffff' }}>
                        “I am passionate about managing and supervising the activities of the team by effective Leadership,
                        Coaching and Development. The last seven years of my work experience has enriched me with traits
                        required to contribute in a corporate environment and taught me valuable skills giving me the confidence
                        to take on challenges and overcome them.”
                      </p>
                    </div>

                {/* Work Experience */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', opacity: 0.6, marginBottom: '14px' }}>
                    <Briefcase size={14} />
                    <span>PROFESSIONAL WORK EXPERIENCE</span>
                  </div>

                  {/* Phykon Solutions - Cell Lead */}
                  <div style={{ marginBottom: '18px', padding: '14px 18px', background: 'rgba(255,255,255,0.06)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.14)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ fontWeight: 700, fontSize: '1rem', color: '#fff' }}>CELL LEAD (TECHNICAL SUPPORT TEAM LEAD)</div>
                      <div style={{ fontSize: '0.8rem', color: '#ffb3a7', fontWeight: 600 }}>Feb 2026 – Present</div>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#ffb3a7', marginBottom: '8px' }}>Phykon Solutions Pvt Ltd • Trivandrum, India</div>
                    <ul style={{ paddingLeft: '18px', fontSize: '0.84rem', lineHeight: 1.6, opacity: 0.85, margin: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <li>Promoted to Cell Lead in February 2026, executing comprehensive Technical Support Team Lead responsibilities.</li>
                      <li>Oversees and elevates team performance, customer satisfaction metrics, and strict SLA compliance through active mentoring.</li>
                      <li>Directly interfaces with clients to coordinate requirements, handle inquiries, and preserve high satisfaction ratings.</li>
                      <li>Collaborates cross-functionally with software engineering and product teams to triage, track, and resolve system bugs.</li>
                      <li>Heads escalation workflows with team members, ensuring rapid root-cause isolation and effective troubleshooting.</li>
                      <li>Drives multi-disciplinary projects, standardizing support documentation and enhancing technical response processes.</li>
                    </ul>
                  </div>

                  {/* Phykon Solutions - Senior Technical Support Specialist */}
                  <div style={{ marginBottom: '18px', padding: '14px 18px', background: 'rgba(255,255,255,0.04)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ fontWeight: 700, fontSize: '1rem', color: '#fff' }}>SENIOR TECHNICAL SUPPORT SPECIALIST</div>
                      <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>May 2025 – Feb 2026</div>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#ffb3a7', marginBottom: '8px' }}>Phykon Solutions Pvt Ltd • Trivandrum, India</div>
                    <ul style={{ paddingLeft: '18px', fontSize: '0.84rem', lineHeight: 1.6, opacity: 0.85, margin: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <li>Hands-on expertise with Atlas platform, Starlink terminals, peripherals, and Galleon-related workflows.</li>
                      <li>Strong understanding of end-to-end ticket lifecycle, order placement, invoicing, and client coordination.</li>
                      <li>Proactively monitors incoming tickets to ensure strict SLA adherence; prioritizes issues to minimize customer impact.</li>
                      <li>Coordinates directly with Starlink and accounts teams for invoice transcription, reporting, and issue resolution.</li>
                    </ul>
                  </div>

                  {/* Allianz Services - Deputy Team Leader */}
                  <div style={{ marginBottom: '18px', padding: '14px 18px', background: 'rgba(255,255,255,0.04)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ fontWeight: 700, fontSize: '1rem', color: '#fff' }}>DEPUTY TEAM LEADER / ACTING TEAM LEADER</div>
                      <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>April 2020 – April 2023</div>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#ffb3a7', marginBottom: '8px' }}>Allianz Services (Allianz Partners Australia) • 8 Years & 4 Months Total Tenure</div>
                    <ul style={{ paddingLeft: '18px', fontSize: '0.84rem', lineHeight: 1.6, opacity: 0.85, margin: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <li>Managed performance targets of the team by effective leadership, coaching, and development.</li>
                      <li>Trained new starters as well as tenured staff resulting in sustained improvement in performance indicators.</li>
                      <li>Organized daily/weekly/monthly management meetings, conducted team 1-on-1s, huddles, and maintained Personal Development Plans (PDP).</li>
                      <li>Utilized Excel to analyze data trends and correlation to identify root causes, design action plans, and visualize management metrics.</li>
                      <li>Awarded <strong>Special Recognition Award</strong> from Allianz Services; resolved customer escalations as part of EOD team.</li>
                    </ul>
                  </div>

                  {/* Allianz Services - Customer Service Expert */}
                  <div style={{ marginBottom: '18px', padding: '14px 18px', background: 'rgba(255,255,255,0.04)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ fontWeight: 700, fontSize: '1rem', color: '#fff' }}>CUSTOMER SERVICE EXPERT</div>
                      <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>2018 – 2020</div>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#ffb3a7', marginBottom: '8px' }}>Allianz Services (Allianz UK Sales Team)</div>
                    <ul style={{ paddingLeft: '18px', fontSize: '0.84rem', lineHeight: 1.6, opacity: 0.85, margin: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <li><strong>Quality Champion</strong>: Met Quality targets consecutively for 24 months.</li>
                      <li>Recipient of <strong>Star of the Month</strong> and Quarterly Awards for achieving performance targets.</li>
                      <li>Tele-Underwriting / Risk assessment on calls and assisting non-trained agents.</li>
                      <li>Collaborated with BP metrics team to build operational dashboards aiding calls logging and real-time interventions.</li>
                    </ul>
                  </div>

                  {/* Senior CSA & CSA */}
                  <div style={{ padding: '14px 18px', background: 'rgba(255,255,255,0.04)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ fontWeight: 700, fontSize: '1rem', color: '#fff' }}>SENIOR CSA & CUSTOMER SERVICE ASSOCIATE</div>
                      <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>2014 – 2018</div>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#ffb3a7', marginBottom: '8px' }}>Allianz Services • Trivandrum, India</div>
                    <ul style={{ paddingLeft: '18px', fontSize: '0.84rem', lineHeight: 1.6, opacity: 0.85, margin: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <li>SPOC for Transfer Rate Improvement project; created Standard Operating Procedure (SOP) for customer complaints handling.</li>
                      <li>SPOC for data collation, sales trackers reporting, and refresher/process update communications.</li>
                    </ul>
                  </div>
                </div>

                {/* Education & Certifications */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '24px' }}>
                  {/* Education */}
                  <div style={{ padding: '16px', background: 'rgba(255,255,255,0.05)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.6, marginBottom: '10px' }}>
                      <GraduationCap size={15} />
                      <span>EDUCATION</span>
                    </div>
                    <div style={{ fontWeight: 600, fontSize: '0.92rem', color: '#fff' }}>B.Tech in Civil Engineering</div>
                    <div style={{ fontSize: '0.8rem', opacity: 0.75, marginTop: '2px' }}>SVNCE, Kerala University (2009 – 2013)</div>
                    <div style={{ fontWeight: 600, fontSize: '0.92rem', color: '#fff', marginTop: '12px' }}>Higher Secondary (CBSE)</div>
                    <div style={{ fontSize: '0.8rem', opacity: 0.75, marginTop: '2px' }}>Holy Trinity Vidya Bhavan (2007 – 2009)</div>
                  </div>

                  {/* Certifications */}
                  <div style={{ padding: '16px', background: 'rgba(255,255,255,0.05)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.6, marginBottom: '10px' }}>
                      <Award size={15} />
                      <span>CERTIFICATIONS</span>
                    </div>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#fff' }}>NASBA Certified Excel Data Analysis</div>
                    <div style={{ fontSize: '0.78rem', opacity: 0.75, marginTop: '2px' }}>Excel 2016 Essential & Data Analysis</div>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#fff', marginTop: '12px' }}>Operations Management Academy</div>
                    <div style={{ fontSize: '0.78rem', opacity: 0.75, marginTop: '2px' }}>Allianz Services Professional Development</div>
                  </div>
                </div>

                {/* Key Skills */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', opacity: 0.6, marginBottom: '10px' }}>
                    KEY COMPETENCIES & TECHNICAL TOOLS
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {[
                      'Technical Support Team Leadership',
                      'Client Relationship Management',
                      'Engineering Bug Triage & Collaboration',
                      'High-Priority Escalations Management',
                      'Team Coaching & Mentoring',
                      'Operations Management',
                      'SLA & KPI Performance Optimization',
                      'Advanced Excel Data Analysis',
                      'MicroStrategy & Verint',
                      'Call Management Systems (CMS)',
                      'Process Documentation & SOPs',
                      'VMware',
                      'DaVinci Resolve Video Editing'
                    ].map((skill, i) => (
                      <span
                        key={i}
                        style={{
                          padding: '6px 12px',
                          background: 'rgba(255,255,255,0.08)',
                          border: '1px solid rgba(255,255,255,0.14)',
                          borderRadius: '9999px',
                          fontSize: '0.78rem',
                          color: 'rgba(255,255,255,0.92)'
                        }}
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Full Download Button */}
                <a
                  href="/resume.pdf"
                  download="SAJIN_SALIM_RESUME.pdf"
                  className="btn-primary"
                  style={{ width: '100%', justifyContent: 'center', textDecoration: 'none' }}
                  onMouseEnter={handleInteractiveEnter}
                  onMouseLeave={handleInteractiveLeave}
                >
                  <Download size={16} />
                  <span>Download SAJIN SALIM_RESUME.pdf</span>
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )}
</div>
  );
}
