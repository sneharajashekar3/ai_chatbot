import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, 
  MessageSquare, 
  Bot, 
  ShieldCheck, 
  Zap, 
  Image as ImageIcon, 
  Mic, 
  ChevronRight, 
  X 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface OnboardingStep {
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  feature: string;
}

const STEPS: OnboardingStep[] = [
  {
    title: "Welcome to BK Ltd 2026",
    description: "Experience the next generation of AI chat. Fast, secure, and powered by the latest models.",
    icon: <Sparkles className="w-8 h-8" />,
    color: "from-blue-500 to-cyan-500",
    feature: "The ultimate AI workspace"
  },
  {
    title: "Multiple AI Models",
    description: "Choose between Pro models for complex reasoning or Flash models for speed and search grounding.",
    icon: <Bot className="w-8 h-8" />,
    color: "from-purple-500 to-pink-500",
    feature: "Switch models instantly"
  },
  {
    title: "Multimodal Interaction",
    description: "Upload images, videos, and audio. Use voice dictation or live voice chat to interact naturally.",
    icon: <Mic className="w-8 h-8" />,
    color: "from-orange-500 to-red-500",
    feature: "Talk, type, or show"
  },
  {
    title: "Enterprise Security",
    description: "Your data is protected with advanced sanitization and security protocols. Production-grade safety is our standard.",
    icon: <ShieldCheck className="w-8 h-8" />,
    color: "from-emerald-500 to-teal-500",
    feature: "Secure & Sanitized"
  }
];

interface OnboardingProps {
  onComplete: () => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const nextStep = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-md p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-lg bg-card border border-border rounded-3xl overflow-hidden shadow-2xl relative"
      >
        <Button 
          variant="ghost" 
          size="icon" 
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground z-10"
          onClick={onComplete}
        >
          <X className="w-5 h-5" />
        </Button>

        <div className="relative h-48 flex items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 1.5, rotate: 10 }}
              className={cn(
                "w-24 h-24 rounded-2xl flex items-center justify-center bg-gradient-to-br shadow-lg",
                STEPS[currentStep].color
              )}
            >
              <div className="text-white">
                {STEPS[currentStep].icon}
              </div>
            </motion.div>
          </AnimatePresence>
          
          <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:20px_20px]" />
          <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent" />
        </div>

        <div className="p-8 pt-0 text-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold uppercase tracking-wider mb-2">
                <Zap className="w-3 h-3" />
                {STEPS[currentStep].feature}
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-foreground">
                {STEPS[currentStep].title}
              </h2>
              <p className="text-muted-foreground text-lg leading-relaxed">
                {STEPS[currentStep].description}
              </p>
            </motion.div>
          </AnimatePresence>

          <div className="flex flex-col gap-4 mt-10">
            <Button 
              size="lg" 
              className="w-full h-14 rounded-2xl text-lg font-semibold shadow-inner transition-all hover:scale-[1.02]"
              onClick={nextStep}
            >
              {currentStep === STEPS.length - 1 ? "Get Started" : "Continue"}
              <ChevronRight className="ml-2 w-5 h-5" />
            </Button>
            
            <div className="flex justify-center gap-2">
              {STEPS.map((_, idx) => (
                <div 
                  key={idx}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-300",
                    idx === currentStep ? "w-8 bg-primary" : "w-2 bg-primary/20"
                  )}
                />
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
