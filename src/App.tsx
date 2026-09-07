import { FormEvent, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { animate, useReducedMotion } from 'framer-motion';
import * as THREE from 'three';
import { Check, ExternalLink, RotateCcw, Scissors, Target } from 'lucide-react';
import { CylinderHalf } from './CylinderHalf';
import { createTextTexture } from './textureUtils';
import type { ApiError, MvpBrief } from './types';

type Stage = 'closed' | 'open' | 'squeezing' | 'done';

function TextCylinder({ texture, scaleX, rotationY }: {
  texture: THREE.Texture;
  scaleX: React.MutableRefObject<number>;
  rotationY: React.MutableRefObject<number>;
}) {
  return <>
    <div className="cylinder cylinder--front" aria-hidden="true">
      <Canvas camera={{ position: [0, 0, 10], fov: 39 }} gl={{ alpha: true, antialias: true, localClippingEnabled: true }}>
        <CylinderHalf side="front" texture={texture} scaleX={scaleX} rotationY={rotationY} />
      </Canvas>
    </div>
  </>;
}

export default function App() {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [stage, setStage] = useState<Stage>('closed');
  const [hovered, setHovered] = useState(false);
  const [url, setUrl] = useState('');
  const [result, setResult] = useState<MvpBrief | null>(null);
  const [error, setError] = useState('');
  const prefersReducedMotion = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLElement>(null);
  const scaleX = useRef(1);
  const speedMult = useRef(1);
  const rotationY = useRef(-Math.PI / 2);

  useEffect(() => {
    let mounted = true;
    createTextTexture().then((nextTexture) => {
      if (mounted) setTexture(nextTexture);
      else nextTexture.dispose();
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const compressed = hovered || stage === 'squeezing';
    const scaleAnimation = animate(scaleX.current, compressed ? 0.72 : 1, {
      type: 'tween', ease: prefersReducedMotion ? 'linear' : [0.2, 0.8, 0.2, 1],
      duration: prefersReducedMotion ? 0.01 : 0.55,
      onUpdate: (value) => { scaleX.current = value; },
    });
    const speedAnimation = animate(speedMult.current, compressed ? 0.6 : 1, {
      duration: prefersReducedMotion ? 0.01 : 0.3,
      onUpdate: (value) => { speedMult.current = value; },
    });
    return () => { scaleAnimation.stop(); speedAnimation.stop(); };
  }, [hovered, stage, prefersReducedMotion]);

  useEffect(() => {
    let frame = 0;
    let previous = performance.now();
    const tick = (time: number) => {
      const delta = Math.min(time - previous, 48);
      previous = time;
      if (!prefersReducedMotion) rotationY.current = (rotationY.current + delta * ((Math.PI * 2) / 16000) * speedMult.current) % (Math.PI * 2);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [prefersReducedMotion]);

  useEffect(() => {
    if (stage === 'done') window.setTimeout(() => resultRef.current?.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' }), 350);
  }, [stage, prefersReducedMotion]);

  const openJuicer = () => {
    if (stage !== 'closed') return;
    setStage('open');
    window.setTimeout(() => inputRef.current?.focus(), prefersReducedMotion ? 0 : 480);
  };

  const squeeze = async (event: FormEvent) => {
    event.preventDefault();
    if (!url.trim() || stage === 'squeezing') return;
    setError('');
    setResult(null);
    setStage('squeezing');
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await response.json() as MvpBrief | ApiError;
      if (!response.ok || 'error' in data) throw new Error('error' in data ? data.error : 'הניתוח נכשל.');
      setResult(data);
      setStage('done');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'לא הצלחנו לנתח את האתר.');
      setStage('open');
    }
  };

  const reset = () => {
    setUrl(''); setResult(null); setError(''); setStage('open');
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const isOpen = stage !== 'closed';

  return <main className="app-shell">
    <section className={`hero stage--${stage}`} aria-label="Squeeze an idea into an MVP">
      <div className="juicer-stage" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
        {texture && <TextCylinder texture={texture} scaleX={scaleX} rotationY={rotationY} />}
        <img className="asset asset--shadow" src="/assets/shadow.png" alt="" />
        <img className="asset asset--bottom" src="/assets/juicer-bottom.png" alt="" />
        <img className="asset asset--whole" src="/assets/juicer-whole.png" alt="A glossy lime-green citrus juicer" />
        <img className="asset asset--top" src="/assets/juicer-top.png" alt="" />

        <form className="squeeze-form" onSubmit={squeeze} aria-hidden={!isOpen}>
          {stage === 'done' ? <div className="result-card" role="status">
            <span className="result-icon"><Check size={18} strokeWidth={3} /></span>
            <span><strong>MVP READY</strong><small>Your focused brief is squeezed and ready.</small></span>
            <button type="button" onClick={reset} aria-label="Try another URL"><RotateCcw size={18} /></button>
          </div> : <div className="input-wrap">
            <label className="sr-only" htmlFor="idea-url">Paste a product URL</label>
            <div className="input-row">
              <input ref={inputRef} id="idea-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="" tabIndex={isOpen ? 0 : -1} disabled={stage === 'squeezing'} autoComplete="url" required />
              {stage === 'squeezing' && <span className="loader" aria-hidden="true" />}
              <button type="submit" hidden disabled={!url.trim() || stage === 'squeezing'}>Squeeze idea</button>
            </div>
            {error && <p className="error-message" role="alert">{error}</p>}
          </div>}
        </form>

        <button className="juicer-trigger" onClick={openJuicer} onFocus={() => setHovered(true)} onBlur={() => setHovered(false)} aria-label="Open the juicer and try Squeeze It" tabIndex={stage === 'closed' ? 0 : -1} />
      </div>

    </section>

    {result && <section className="brief" ref={resultRef} aria-labelledby="brief-title">
      <div className="brief__header">
        <div>
          <span className="brief__kicker">YOUR MINIMUM VIABLE BRIEF</span>
          <h2 id="brief-title">{result.siteName}</h2>
          <p>{result.siteSummary}</p>
        </div>
        <a href={result.scannedUrl} target="_blank" rel="noreferrer">SOURCE <ExternalLink size={14} /></a>
      </div>

      <div className="brief__signal">
        <Target size={24} />
        <div><span>CORE VALUE</span><strong>{result.coreValue}</strong><small>למי: {result.targetUser}</small></div>
      </div>

      <div className="brief__grid">
        <article className="brief-card brief-card--keep">
          <span className="brief-card__number">01</span><h3>מה חייב להישאר</h3>
          <p className="brief-card__lead">{result.mvp.oneLine}</p>
          <ol>{result.mvp.mustHave.map((item) => <li key={item}>{item}</li>)}</ol>
        </article>
        <article className="brief-card brief-card--cut">
          <span className="brief-card__number">02</span><h3><Scissors size={18} /> מה חותכים עכשיו</h3>
          <ul>{result.mvp.cut.map((item) => <li key={item}>{item}</li>)}</ul>
        </article>
        <article className="brief-card brief-card--build">
          <span className="brief-card__number">03</span><h3>סדר בנייה</h3>
          <ol>{result.mvp.buildOrder.map((item) => <li key={item}>{item}</li>)}</ol>
        </article>
      </div>

      <div className="brief__metric"><span>THE ONE METRIC</span><strong>{result.mvp.successMetric}</strong></div>
      <details className="brief__details">
        <summary>מה זיהינו באתר + הנחות</summary>
        <div><h3>פיצ׳רים שנצפו</h3><ul>{result.observedFeatures.map((item) => <li key={item}>{item}</li>)}</ul></div>
        <div><h3>הנחות לבדיקה</h3><ul>{result.assumptions.map((item) => <li key={item}>{item}</li>)}</ul></div>
      </details>
      <div className="brief__footer"><span>ANALYZED WITH {result.model}</span><button onClick={reset}><RotateCcw size={16} /> SQUEEZE ANOTHER</button></div>
    </section>}
  </main>;
}
