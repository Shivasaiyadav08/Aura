"use client";

import { useEffect, useState } from "react";

const STEPS = [
  { text: "Searching the web for sources...", duration: 2000 },
  { text: "Parsing and ranking results...", duration: 1500 },
  { text: "Building intelligence profile...", duration: 3000 },
  { text: "Verifying citations and sources...", duration: 1500 },
  { text: "Finalizing report...", duration: 1000 },
];

export function LoadingState() {
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Smooth progress bar
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 93) return 93;
        const inc = prev < 40 ? 6 : prev < 70 ? 3 : prev < 88 ? 1.5 : 0.5;
        return Math.min(93, prev + inc);
      });
    }, 350);

    // Step advancement
    let idx = 0;
    let timeout: NodeJS.Timeout;
    const advance = () => {
      if (idx < STEPS.length - 1) {
        timeout = setTimeout(() => {
          idx++;
          setStep(idx);
          advance();
        }, STEPS[idx].duration);
      }
    };
    advance();

    return () => {
      clearInterval(progressInterval);
      clearTimeout(timeout);
    };
  }, []);

  return (
    <div role="status" aria-label="Building intelligence report, please wait" className="animate-fade-in-up">
      {/* Skeleton report document */}
      <div className="report-document overflow-hidden">

        {/* Skeleton header */}
        <div className="px-8 pt-8 pb-6 border-b border-slate-100 dark:border-slate-800/80">
          <div className="h-2.5 w-36 skeleton-pulse rounded mb-4" />
          <div className="h-8 w-72 skeleton-pulse rounded-lg mb-2" />
          <div className="h-3.5 w-52 skeleton-pulse rounded mt-3" />
          <div className="mt-5 h-px bg-gradient-to-r from-blue-500/20 via-slate-200 dark:via-slate-700 to-transparent" />
        </div>

        {/* Skeleton hero */}
        <div className="px-8 py-7 border-b border-slate-100 dark:border-slate-800/80">
          <div className="flex gap-7">
            <div className="flex-shrink-0 w-44 h-44 rounded-xl skeleton-pulse" />
            <div className="flex-1 space-y-3 pt-1">
              <div className="h-2.5 w-28 skeleton-pulse rounded mb-4" />
              <div className="h-3.5 w-full skeleton-pulse rounded" />
              <div className="h-3.5 w-5/6 skeleton-pulse rounded" />
              <div className="h-3.5 w-full skeleton-pulse rounded" />
              <div className="h-3.5 w-4/5 skeleton-pulse rounded" />
              <div className="h-3.5 w-3/4 skeleton-pulse rounded" />
            </div>
          </div>
        </div>

        {/* Skeleton details table */}
        <div className="px-8 py-7 border-b border-slate-100 dark:border-slate-800/80">
          <div className="h-2.5 w-24 skeleton-pulse rounded mb-5" />
          <div className="h-10 w-full skeleton-pulse rounded-lg mb-2" />
          <div className="h-12 w-full skeleton-pulse rounded-lg opacity-60" />
        </div>

        {/* Skeleton timeline + education */}
        <div className="px-8 py-7 border-b border-slate-100 dark:border-slate-800/80">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <div className="h-2.5 w-28 skeleton-pulse rounded mb-5" />
              <div className="space-y-4 pl-5">
                {[1,2,3,4].map(i => (
                  <div key={i} className="flex gap-3 items-start">
                    <div className="w-14 h-5 skeleton-pulse rounded-full flex-shrink-0 mt-0.5" />
                    <div className="h-4 skeleton-pulse rounded flex-1" />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="h-2.5 w-20 skeleton-pulse rounded mb-5" />
              <div className="space-y-3">
                {[1,2].map(i => <div key={i} className="h-16 skeleton-pulse rounded-xl" />)}
              </div>
            </div>
          </div>
        </div>

        {/* Progress indicator */}
        <div className="px-8 py-5 bg-slate-50/50 dark:bg-slate-900/20 border-t border-slate-100 dark:border-slate-800/60">
          <div className="flex items-center gap-3 mb-3">
            <div className="relative w-4 h-4 flex-shrink-0">
              <div className="absolute inset-0 rounded-full border-2 border-slate-200 dark:border-slate-700 border-t-blue-600 dark:border-t-blue-400 animate-spin" />
            </div>
            <p className="text-[12px] font-semibold text-slate-600 dark:text-slate-400">
              {STEPS[step].text}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-600 to-indigo-500 rounded-full transition-all duration-400 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 font-mono w-8 text-right">
              {Math.round(progress)}%
            </span>
          </div>
        </div>
      </div>
      <span className="sr-only">Building intelligence report, please wait…</span>
    </div>
  );
}

export default LoadingState;
