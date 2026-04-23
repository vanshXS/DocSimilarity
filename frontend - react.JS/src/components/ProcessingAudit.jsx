import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import React, { useMemo } from "react";

export default function ProcessingAudit({ status, currentStep, progressPercent }) {
  // Simplified, non-technical steps for better user understanding
  const steps = useMemo(() => [
    { id: "extraction", label: "Reading Documents", start: 1, end: 35 },
    { id: "pre-process", label: "Understanding Content", start: 36, end: 55 },
    { id: "analyze", label: "Comparing Text", start: 56, end: 90 },
    { id: "final", label: "Preparing Results", start: 91, end: 100 },
  ], []);

  const getStepStatus = (step) => {
    if (progressPercent >= step.end) return "complete";
    if (progressPercent >= step.start) return "active";
    return "pending";
  };

  // Improved calculation for the progress circle to prevent "jitter"
  const strokeDasharray = 339.3; // 2 * PI * 54
  const strokeDashoffset = strokeDasharray - (strokeDasharray * Math.max(2, progressPercent)) / 100;

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-12 md:py-20 lg:max-w-2xl">
      <div className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-8 md:p-12 shadow-xl shadow-slate-200/40 text-center transition-all duration-500">
        
        {/* Stable Progress Ring */}
        <div className="relative mx-auto mb-8 flex h-28 w-28 items-center justify-center md:h-32 md:w-32">
          <div className="absolute inset-0 rounded-full border-[6px] border-slate-50" />
          <svg className="absolute inset-0 h-full w-full -rotate-90 transition-transform">
            <circle
              cx="50%"
              cy="50%"
              r="54"
              fill="transparent"
              stroke="currentColor"
              strokeWidth="10"
              strokeDasharray={strokeDasharray}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="text-indigo-600 transition-all duration-700 ease-out"
            />
          </svg>
          <div className="flex flex-col items-center justify-center">
             <span className="text-2xl font-black text-slate-900 md:text-3xl">{progressPercent || 0}%</span>
             <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Status</span>
          </div>
        </div>

        <h2 className="text-2xl font-black tracking-tight text-slate-900 md:text-3xl">Analyzing Documents</h2>
        <p className="mt-3 text-base font-medium text-slate-500 md:text-lg">
           {!currentStep ? "Starting analysis..." :
            currentStep.startsWith("Extracting Documents") ? currentStep :
            currentStep.startsWith("Comparing Documents") ? currentStep :
            currentStep.startsWith("Pre-filtering") ? "Finding similar document pairs..." :
            currentStep === "Extracting Document Text (OCR)" ? "Reading uploaded files..." :
            currentStep === "Preprocessing Content" ? "Analyzing text structure..." :
            currentStep === "Finalizing Results" ? "Generating report..." :
            currentStep}
        </p>

        {/* Step Flow List - More Stable Design */}
        <div className="mt-10 space-y-3 text-left">
          {steps.map((step) => {
            const stepStatus = getStepStatus(step);
            const isActive = stepStatus === "active";
            const isComplete = stepStatus === "complete";
            
            return (
              <div 
                key={step.id}
                className={`flex items-center gap-4 rounded-xl border p-4 transition-all duration-300 ${
                  isActive 
                    ? "border-indigo-100 bg-indigo-50/50" 
                    : isComplete
                    ? "border-emerald-50 bg-emerald-50/20"
                    : "border-slate-50 opacity-40"
                }`}
              >
                <div className="flex-shrink-0">
                  {isComplete ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  ) : isActive ? (
                    <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
                  ) : (
                    <Circle className="h-5 w-5 text-slate-300" />
                  )}
                </div>
                <div className="flex-1">
                   <p className={`text-sm font-bold ${
                     isActive ? "text-indigo-900 font-black" : "text-slate-600 font-semibold"
                   }`}>
                      {step.label}
                   </p>
                </div>
                {isActive && (
                   <span className="flex h-2 w-2 rounded-full bg-indigo-600 animate-pulse" />
                )}
              </div>
            );
          })}
        </div>

        {/* Subtle Background Elements */}
        <div className="absolute -bottom-16 -right-16 h-48 w-48 rounded-full bg-indigo-50/30 blur-3xl pointer-events-none" />
        <div className="absolute -top-16 -left-16 h-48 w-48 rounded-full bg-sky-50/30 blur-3xl pointer-events-none" />
      </div>
      
      <p className="mt-6 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400 opacity-60">
         DocSimilarity AI • Powered by Neural Comparison
      </p>
    </div>
  );
}
