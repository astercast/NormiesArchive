"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, Download, Share2,
  Eye, EyeOff, Play, Pause, ExternalLink, Volume2, VolumeX, Loader2
} from "lucide-react";
import { useNormieHistory } from "@/hooks/useNormieHistory";
import NormieGrid from "@/components/NormieGrid";
import TimelineScrubber from "@/components/TimelineScrubber";
import HeatmapOverlay from "@/components/HeatmapOverlay";
import ParticleCanvas from "@/components/ParticleCanvas";
import { GRID_SIZE, diffStrings } from "@/lib/pixelUtils";
import {
  playPixelBirth, playPixelDeath, playLevelUp,
  playScrubTick, setSoundEnabled
} from "@/lib/sound";

interface Props { tokenId: number }
const SCALE = 10;

export default function NormieDetailClient({ tokenId }: Props) {
  const {
    originalPixels, currentPixels, frames, info, traits,
    editHistory, burnHistory, diffAsIndices, isLoading, lifeStory, normieType,
  } = useNormieHistory(tokenId);

  const [step, setStep] = useState(0);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showParticles, setShowParticles] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [soundOn, setSoundOn] = useState(false); // off by default (less jarring)
  const [isExporting, setIsExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  const [copied, setCopied] = useState(false);
  const [particles, setParticles] = useState<{ added: number[]; removed: number[] }>({ added: [], removed: [] });

  const playRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevStepRef = useRef(0);
  const maxStep = Math.max(0, frames.length - 1);
  const currentFrame = frames[step] || currentPixels || originalPixels || "";

  // Level-up sound
  useEffect(() => {
    if (soundOn && (info?.level ?? 0) >= 50) {
      const t = setTimeout(() => playLevelUp(), 1000);
      return () => clearTimeout(t);
    }
  }, [info?.level, soundOn]);

  const stopPlay = useCallback(() => {
    setIsPlaying(false);
    if (playRef.current) clearInterval(playRef.current);
  }, []);

  const startPlay = useCallback(() => {
    if (maxStep === 0) return;
    setIsPlaying(true);
    playRef.current = setInterval(() => {
      setStep((prev) => {
        if (prev >= maxStep) { stopPlay(); return prev; }
        return prev + 1;
      });
    }, 600);
  }, [maxStep, stopPlay]);

  useEffect(() => () => { if (playRef.current) clearInterval(playRef.current); }, []);

  // Particle + sound on step change
  useEffect(() => {
    if (!frames.length) return;
    const prev = frames[prevStepRef.current] || "";
    const next = frames[step] || "";
    if (prev && next && prev !== next) {
      const diff = diffStrings(prev, next);
      setParticles(diff);
      if (soundOn && showParticles) {
        if (diff.added.length) playPixelBirth(Math.min(diff.added.length, 8));
        if (diff.removed.length) playPixelDeath(Math.min(diff.removed.length, 8));
      }
    }
    prevStepRef.current = step;
  }, [step, frames, showParticles, soundOn]);

  const handleStep = useCallback((v: number) => {
    if (isPlaying) stopPlay();
    if (soundOn) playScrubTick();
    setStep(v);
  }, [isPlaying, stopPlay, soundOn]);

  const handleToggleSound = useCallback(() => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
  }, [soundOn]);

  const handleExport = useCallback(async () => {
    if (!frames.length || isExporting) return;
    setIsExporting(true); setExportPct(0);
    try {
      const { exportTimelineGif } = await import("@/lib/gifExport");
      await exportTimelineGif(frames, tokenId, 8, setExportPct);
    } catch (err) { console.error("Export failed", err); }
    finally { setIsExporting(false); setExportPct(0); }
  }, [frames, tokenId, isExporting]);

  const handleShare = useCallback(() => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  // Get trait value from attributes array
  const getAttribute = (key: string) =>
    traits?.attributes.find(a => a.trait_type === key)?.value;

  const level = info?.level ?? (getAttribute("Level") as number | undefined) ?? 1;
  const ap = info?.actionPoints ?? (getAttribute("Action Points") as number | undefined) ?? 0;
  const customized = info?.customized ?? (getAttribute("Customized") === "Yes");
  const type = normieType ?? (getAttribute("Type") as string | undefined);

  if (isLoading && !currentPixels) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="flex items-center gap-3 mb-8">
          <Link href="/" className="text-n-muted hover:text-n-text transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="font-mono text-2xl text-n-faint animate-pulse">loading normie #{tokenId}…</div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-n-surface border border-n-border rounded" style={{ width: GRID_SIZE*SCALE, height: GRID_SIZE*SCALE, maxWidth:"100%" }} />
          <div className="space-y-2">
            {Array.from({length:5}).map((_,i)=>(
              <div key={i} className="h-12 bg-n-surface border border-n-border rounded animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">

      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/" className="text-n-muted hover:text-n-text transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="font-mono text-2xl font-medium text-n-text">
          normie #{tokenId}
        </h1>
        {type && (
          <span className="tag">{type.toLowerCase()}</span>
        )}
        {customized && (
          <span className="tag tag-active">customized</span>
        )}
        <span className="tag tag-active">lvl {level}</span>

        {/* Right: action buttons */}
        <div className="flex items-center gap-1.5 ml-auto">
          <button onClick={handleToggleSound} title={soundOn ? "mute" : "sound on"}
            className="p-1.5 border border-n-border text-n-muted rounded hover:text-n-text hover:border-n-text transition-colors">
            {soundOn ? <Volume2 className="w-3.5 h-3.5"/> : <VolumeX className="w-3.5 h-3.5"/>}
          </button>
          <a href={`https://opensea.io/assets/ethereum/0x9Eb6E2025B64f340691e424b7fe7022fFDE12438/${tokenId}`}
            target="_blank" rel="noopener noreferrer"
            className="px-2.5 py-1.5 border border-n-border text-n-muted text-xs font-mono rounded hover:text-n-text hover:border-n-text transition-colors flex items-center gap-1">
            <ExternalLink className="w-3 h-3"/> opensea
          </a>
          <button onClick={handleShare}
            className="px-2.5 py-1.5 border border-n-border text-n-muted text-xs font-mono rounded hover:text-n-text hover:border-n-text transition-colors flex items-center gap-1">
            <Share2 className="w-3 h-3"/> {copied ? "copied!" : "share"}
          </button>
          <button onClick={handleExport} disabled={isExporting || frames.length === 0}
            className="px-2.5 py-1.5 bg-n-text text-n-bg text-xs font-mono rounded hover:opacity-80 transition-opacity disabled:opacity-40 flex items-center gap-1">
            {isExporting
              ? <><Loader2 className="w-3 h-3 animate-spin"/> {Math.round(exportPct*100)}%</>
              : <><Download className="w-3 h-3"/> export gif</>
            }
          </button>
        </div>
      </div>

      {/* Stats row */}
      {info && (
        <div className="grid grid-cols-4 gap-px bg-n-border">
          {[
            { label: "level", value: level },
            { label: "action pts", value: ap },
            { label: "edits", value: editHistory.length },
            { label: "px net diff", value: (diffAsIndices?.added.length ?? 0) + (diffAsIndices?.removed.length ?? 0) },
          ].map(({ label, value }) => (
            <div key={label} className="bg-n-bg px-4 py-3">
              <div className="text-xs font-mono text-n-muted">{label}</div>
              <div className="text-lg font-mono font-medium text-n-text">{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Main layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">

        {/* Left: Canvas */}
        <div className="space-y-3">
          {/* Pixel canvas wrapper */}
          <div className="relative border border-n-border rounded overflow-hidden inline-block"
               style={{ width: GRID_SIZE*SCALE, height: GRID_SIZE*SCALE, maxWidth: "100%" }}>
            {currentFrame && (
              <NormieGrid
                pixelsStr={currentFrame}
                scale={SCALE}
                showHeatmap={showHeatmap}
                addedIndices={showHeatmap ? (diffAsIndices?.added ?? []) : undefined}
                removedIndices={showHeatmap ? (diffAsIndices?.removed ?? []) : undefined}
              />
            )}
            {showHeatmap && diffAsIndices && (
              <HeatmapOverlay
                addedIndices={diffAsIndices.added}
                removedIndices={diffAsIndices.removed}
                scale={SCALE}
              />
            )}
            {showParticles && (
              <ParticleCanvas
                addedPixels={particles.added}
                removedPixels={particles.removed}
                active={particles.added.length > 0 || particles.removed.length > 0}
              />
            )}
            {/* Step badge */}
            <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-n-bg/80 border border-n-border text-xs font-mono text-n-muted rounded">
              {step === 0 ? "origin" : step === maxStep ? "current" : `edit ${step}`}
            </div>
          </div>

          {/* Canvas toggles */}
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setShowHeatmap(!showHeatmap)}
              className={`flex items-center gap-1 px-2.5 py-1 border text-xs font-mono rounded transition-colors ${
                showHeatmap ? "border-n-text text-n-text bg-n-surface" : "border-n-border text-n-muted hover:border-n-muted"
              }`}>
              {showHeatmap ? <Eye className="w-3 h-3"/> : <EyeOff className="w-3 h-3"/>}
              heatmap
            </button>
            <button onClick={() => setShowParticles(!showParticles)}
              className={`flex items-center gap-1 px-2.5 py-1 border text-xs font-mono rounded transition-colors ${
                showParticles ? "border-n-text text-n-text bg-n-surface" : "border-n-border text-n-muted hover:border-n-muted"
              }`}>
              particles
            </button>
            {diffAsIndices && (
              <div className="flex items-center gap-2 px-2.5 py-1 border border-n-border rounded text-xs font-mono text-n-muted">
                <span>+{diffAsIndices.added.length}</span>
                <span>−{diffAsIndices.removed.length}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: Timeline + history */}
        <div className="space-y-5">

          {/* Timeline control */}
          <div className="border border-n-border rounded p-4 space-y-4 bg-n-white">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-n-muted uppercase tracking-wider">timeline</span>
              <div className="flex items-center gap-1.5">
                <button onClick={() => handleStep(Math.max(0, step-1))} disabled={step===0}
                  className="p-1 border border-n-border rounded text-n-muted disabled:opacity-30 hover:text-n-text hover:border-n-text transition-colors">
                  <ArrowLeft className="w-3 h-3"/>
                </button>
                <button onClick={isPlaying ? stopPlay : startPlay} disabled={maxStep===0}
                  className="flex items-center gap-1 px-2.5 py-1 border border-n-text text-n-text text-xs font-mono rounded hover:bg-n-text hover:text-n-bg transition-colors disabled:opacity-30">
                  {isPlaying ? <><Pause className="w-3 h-3"/> pause</> : <><Play className="w-3 h-3"/> play</>}
                </button>
                <button onClick={() => handleStep(Math.min(maxStep, step+1))} disabled={step===maxStep}
                  className="p-1 border border-n-border rounded text-n-muted disabled:opacity-30 hover:text-n-text hover:border-n-text transition-colors">
                  <ArrowRight className="w-3 h-3"/>
                </button>
              </div>
            </div>

            {frames.length > 0 ? (
              <TimelineScrubber
                value={step} max={maxStep}
                editHistory={editHistory}
                onChange={handleStep}
              />
            ) : (
              <div className="text-xs font-mono text-n-faint text-center py-6">
                {isLoading
                  ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin"/>loading history…</span>
                  : "no edit history — pristine from mint"}
              </div>
            )}
          </div>

          {/* Edit log */}
          {editHistory.length > 0 && (
            <div className="border border-n-border rounded overflow-hidden">
              <div className="px-4 py-2.5 border-b border-n-border flex items-center justify-between">
                <span className="text-xs font-mono text-n-muted uppercase tracking-wider">transformation log</span>
                <span className="text-xs font-mono text-n-faint">{editHistory.length} events</span>
              </div>
              <div className="divide-y divide-n-border max-h-56 overflow-y-auto">
                {editHistory.map((edit, i) => (
                  <motion.div key={edit.txHash}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                    onClick={() => handleStep(i + 1)}
                    className={`px-4 py-2.5 flex items-center gap-3 cursor-pointer hover:bg-n-surface transition-colors ${step===i+1 ? "bg-n-surface border-l-2 border-n-text" : ""}`}>
                    <span className="text-xs font-mono text-n-faint w-4 text-center">{i+1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-mono text-n-text">
                        {new Date(edit.timestamp*1000).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}
                      </div>
                      <div className="text-xs font-mono text-n-muted truncate">
                        {edit.transformer.slice(0,10)}…{edit.transformer.slice(-4)}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs font-mono text-n-text">Δ{edit.changeCount}</div>
                      <div className="text-xs font-mono text-n-faint">{edit.newPixelCount}px</div>
                    </div>
                    <a href={`https://etherscan.io/tx/${edit.txHash}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-n-faint hover:text-n-muted transition-colors"
                      onClick={(e) => e.stopPropagation()}>
                      <ExternalLink className="w-3 h-3"/>
                    </a>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Burn log */}
          {burnHistory.length > 0 && (
            <div className="border border-n-border rounded overflow-hidden">
              <div className="px-4 py-2.5 border-b border-n-border">
                <span className="text-xs font-mono text-n-muted uppercase tracking-wider">burn events</span>
              </div>
              <div className="divide-y divide-n-border">
                {burnHistory.map((burn) => (
                  <div key={burn.txHash} className="px-4 py-2.5 flex items-center gap-3">
                    <div className="flex-1">
                      <div className="text-xs font-mono text-n-text">
                        {new Date(burn.timestamp*1000).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}
                      </div>
                      <div className="text-xs font-mono text-n-muted">{burn.owner.slice(0,10)}…{burn.owner.slice(-4)}</div>
                    </div>
                    <div className="text-xs font-mono font-medium text-n-text">+{burn.totalActions} AP</div>
                    <a href={`https://etherscan.io/tx/${burn.txHash}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-n-faint hover:text-n-muted transition-colors">
                      <ExternalLink className="w-3 h-3"/>
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Life Story */}
      {lifeStory.length > 0 && (
        <section className="border-t border-n-border pt-8 space-y-4">
          <h2 className="text-xs font-mono text-n-muted uppercase tracking-widest">life story</h2>
          <div className="space-y-3 max-w-xl">
            {lifeStory.map((para, i) => (
              <motion.p key={i}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.07 }}
                className="text-xs font-mono text-n-muted leading-relaxed">
                {para}
              </motion.p>
            ))}
          </div>
        </section>
      )}

      {/* Prev / Next navigation */}
      <div className="flex items-center justify-between pt-4 border-t border-n-border">
        {tokenId > 0 ? (
          <Link href={`/normie/${tokenId-1}`}
            className="flex items-center gap-1.5 text-xs font-mono text-n-muted hover:text-n-text transition-colors">
            <ArrowLeft className="w-3.5 h-3.5"/> #{tokenId-1}
          </Link>
        ) : <div/>}
        <Link href="/" className="text-xs font-mono text-n-faint hover:text-n-muted transition-colors">
          all normies
        </Link>
        {tokenId < 9999 ? (
          <Link href={`/normie/${tokenId+1}`}
            className="flex items-center gap-1.5 text-xs font-mono text-n-muted hover:text-n-text transition-colors">
            #{tokenId+1} <ArrowRight className="w-3.5 h-3.5"/>
          </Link>
        ) : <div/>}
      </div>
    </div>
  );
}
