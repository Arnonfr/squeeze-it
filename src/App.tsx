import { FormEvent, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { animate, useReducedMotion } from 'framer-motion';
import * as THREE from 'three';
import { Check, ExternalLink, RotateCcw, X } from 'lucide-react';
import { CylinderHalf } from './CylinderHalf';
import { createTextTexture } from './textureUtils';
import type { ApiError, MvpBrief } from './types';

type Stage = 'closed' | 'open' | 'squeezing' | 'done';

const analysisSteps = [
  ['READING THE PAGE', 'Collecting visible copy, actions and product signals.'],
  ['MAPPING THE PRODUCT', 'Identifying the audience and the central value loop.'],
  ['SPOTTING FEATURE CREEP', 'Separating proof-of-value from tempting extras.'],
  ['EXTRACTING THE MVP', 'Keeping only what the first useful version needs.'],
  ['COMPRESSING THE BRIEF', 'Turning the findings into a short build sequence.'],
] as const;

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function TextCylinder({ texture, scaleX, rotationY }: {
  texture: THREE.Texture;
  scaleX: React.MutableRefObject<number>;
  rotationY: React.MutableRefObject<number>;
}) {
  return <>
    <div className="cylinder cylinder--back" aria-hidden="true">
      <Canvas camera={{ position: [0, 0, 10], fov: 39 }} gl={{ alpha: true, antialias: true }}>
        <CylinderHalf side="back" texture={texture} scaleX={scaleX} rotationY={rotationY} />
      </Canvas>
    </div>
    <div className="cylinder cylinder--front" aria-hidden="true">
      <Canvas camera={{ position: [0, 0, 10], fov: 39 }} gl={{ alpha: true, antialias: true }}>
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
  const [analysisStep, setAnalysisStep] = useState(0);
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
    const compressed = stage === 'squeezing';
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
    if (stage !== 'squeezing') { setAnalysisStep(0); return; }
    const timer = window.setInterval(() => {
      setAnalysisStep((current) => Math.min(current + 1, analysisSteps.length - 1));
    }, 2200);
    return () => window.clearInterval(timer);
  }, [stage]);

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
    const normalizedUrl = normalizeUrl(url);
    setUrl(normalizedUrl);
    setError('');
    setResult(null);
    setStage('squeezing');
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: normalizedUrl }),
      });
      const data = await response.json() as MvpBrief | ApiError;
      if (!response.ok || 'error' in data) throw new Error('error' in data ? data.error : 'Analysis failed.');
      setResult(data);
      setStage('done');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'We could not analyze this website.');
      setStage('open');
    }
  };

  const reset = () => {
    setUrl(''); setResult(null); setError(''); setStage('open');
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const closeJuicer = () => {
    setUrl(''); setResult(null); setError(''); setStage('closed'); setHovered(false);
  };

  const isOpen = stage !== 'closed';

  return <main className="app-shell">
    <section className={`hero stage--${stage} ${hovered && stage === 'closed' ? 'is-hovered' : ''}`} aria-label="Squeeze an idea into an MVP">
      <img className="background-wordmark" src="/assets/background-text-squeeze-it.png" alt="" aria-hidden="true" />
      <div className="juicer-stage" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
        {texture && <TextCylinder texture={texture} scaleX={scaleX} rotationY={rotationY} />}
        <img className="asset asset--shadow" src="/assets/shadow.png" alt="" />
        <img className="asset asset--bottom" src="/assets/juicer-bottom.png" alt="" />
        <img className="asset asset--whole" src="/assets/juicer-whole.png" alt="A glossy lime-green citrus juicer" />
        <img className="asset asset--top" src="/assets/juicer-top.png" alt="" />

        <form className="squeeze-form" onSubmit={squeeze} aria-hidden={!isOpen}>
          <button className="close-trigger" type="button" onClick={closeJuicer} aria-label="Close and return">
            <X size={20} strokeWidth={2.8} />
          </button>
          {stage === 'done' ? <div className="result-card" role="status">
            <span className="result-icon"><Check size={18} strokeWidth={3} /></span>
            <span><strong>MVP READY</strong><small>Your focused brief is squeezed and ready.</small></span>
            <button type="button" onClick={reset} aria-label="Try another URL"><RotateCcw size={18} /></button>
          </div> : <div className="input-wrap">
            <p className="input-instruction">PASTE A PRODUCT URL — WE'LL SQUEEZE OUT THE MVP</p>
            <label className="sr-only" htmlFor="idea-url">Paste a product URL</label>
            <div className="input-row">
              <input ref={inputRef} id="idea-url" type="text" inputMode="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="yourproduct.com" tabIndex={isOpen ? 0 : -1} disabled={stage === 'squeezing'} autoComplete="url" required />
              {stage === 'squeezing' && <span className="loader" aria-hidden="true" />}
              <button type="submit" hidden disabled={!url.trim() || stage === 'squeezing'}>Squeeze idea</button>
            </div>
            {error && <p className="error-message" role="alert">{error}</p>}
          </div>}
        </form>

        <button className="juicer-trigger" onClick={openJuicer} onFocus={() => setHovered(true)} onBlur={() => setHovered(false)} aria-label="Open the juicer and try Squeeze It" tabIndex={stage === 'closed' ? 0 : -1} />
        <span className="hover-hint" aria-hidden="true">CLICK TO SQUEEZE</span>
      </div>

      {stage === 'squeezing' && <div className="analysis-feed" role="status" aria-live="polite">
        <div className="analysis-feed__rail" aria-hidden="true">
          {analysisSteps.map((_, index) => <span key={index} className={index <= analysisStep ? 'is-active' : ''} />)}
        </div>
        <div className="analysis-feed__copy">
          <span>{String(analysisStep + 1).padStart(2, '0')} / {String(analysisSteps.length).padStart(2, '0')}</span>
          <strong>{analysisSteps[analysisStep][0]}</strong>
          <p>{analysisSteps[analysisStep][1]}</p>
        </div>
      </div>}

    </section>

    {result && <section className="brief" ref={resultRef} aria-labelledby="brief-title">
      <img className="brief__juicer" src="/assets/juicer-whole.png" alt="" aria-hidden="true" />
      <div className="brief__header">
        <div>
          <span className="brief__kicker">YOUR MINIMUM VIABLE BRIEF</span>
          <h2 id="brief-title">{result.siteName}</h2>
          <p>{result.siteSummary}</p>
        </div>
        <a href={result.scannedUrl} target="_blank" rel="noreferrer">SOURCE <ExternalLink size={14} /></a>
      </div>

      <div className="brief__signal">
        <span>THE ONE THING WORTH KEEPING</span>
        <strong>{result.coreValue}</strong>
        <small>For {result.targetUser}</small>
      </div>

      <div className="brief__grid">
        <article className="brief-column">
          <span className="brief-column__number">01</span><h3>KEEP</h3>
          <p className="brief-card__lead">{result.mvp.oneLine}</p>
          <ul>{result.mvp.mustHave.slice(0, 4).map((item) => <li key={item}>{item}</li>)}</ul>
        </article>
        <article className="brief-column">
          <span className="brief-column__number">02</span><h3>CUT</h3>
          <ul>{result.mvp.cut.slice(0, 4).map((item) => <li key={item}>{item}</li>)}</ul>
        </article>
        <article className="brief-column">
          <span className="brief-column__number">03</span><h3>BUILD</h3>
          <ol>{result.mvp.buildOrder.slice(0, 4).map((item) => <li key={item}>{item}</li>)}</ol>
        </article>
      </div>

      <div className="brief__temptations">
        <div><span>THE TEMPTATIONS</span><h3>Things someone will definitely ask you to add</h3></div>
        <div className="quote-cloud">{result.featureRequests.slice(0, 4).map((item) => <blockquote key={item}>“{item}”</blockquote>)}</div>
      </div>
      <div className="brief__metric"><span>THE ONE METRIC</span><strong>{result.mvp.successMetric}</strong></div>
      <div className="brief__footer"><span>ANALYZED WITH {result.model}</span><button onClick={reset}><RotateCcw size={16} /> SQUEEZE ANOTHER</button></div>
    </section>}
  </main>;
}
