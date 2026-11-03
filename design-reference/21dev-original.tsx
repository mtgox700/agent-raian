"use client";

import * as React from "react";
import { motion, useScroll, useTransform, useSpring, useMotionValue, useMotionTemplate } from "framer-motion";
import { cn } from "@/lib/utils";
import { 
  Menu, 
  X, 
  ArrowRight, 
  Sparkles, 
  Zap, 
  Target, 
  Mail, 
  TrendingUp,
  Users,
  Database,
  MessageSquare,
  CheckCircle,
  ChevronDown,
  Linkedin,
  Twitter,
  Github
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

// Three.js Neural Network Component
const NeuralNetwork = () => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
    }> = [];

    for (let i = 0; i < 150; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
      });
    }

    const animate = () => {
      ctx.fillStyle = "rgba(5, 5, 8, 0.1)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p, i) => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fillStyle = "#00D4FF";
        ctx.fill();

        particles.forEach((p2, j) => {
          if (i === j) return;
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(0, 212, 255, ${0.15 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        });
      });

      requestAnimationFrame(animate);
    };

    animate();

    const handleResize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full opacity-60"
      style={{ background: "transparent" }}
    />
  );
};

// Custom Cursor
const CustomCursor = () => {
  const [position, setPosition] = React.useState({ x: 0, y: 0 });
  const [isVisible, setIsVisible] = React.useState(false);

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY });
      setIsVisible(true);
    };

    const handleMouseLeave = () => setIsVisible(false);

    window.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  if (!isVisible) return null;

  return (
    <div
      className="fixed w-3 h-3 rounded-full pointer-events-none z-50 mix-blend-difference"
      style={{
        left: position.x - 6,
        top: position.y - 6,
        background: "#00D4FF",
        boxShadow: "0 0 20px #00D4FF",
      }}
    />
  );
};

// Scroll Progress Bar
const ScrollProgress = () => {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });

  return (
    <motion.div
      className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#00D4FF] to-[#F0B429] origin-left z-50"
      style={{ scaleX }}
    />
  );
};

// Navigation
const Navigation = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed top-0 w-full z-40 transition-all duration-300",
        scrolled ? "bg-[#050508]/80 backdrop-blur-xl border-b border-white/5" : "bg-transparent"
      )}
    >
      <nav className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <path
                d="M20 5L30 15L20 25L10 15L20 5Z"
                fill="url(#cyan-gradient)"
                filter="url(#glow)"
              />
              <line x1="10" y1="20" x2="30" y2="20" stroke="#0077A8" strokeWidth="2" />
              <circle cx="15" cy="30" r="2" fill="#0077A8" />
              <circle cx="25" cy="30" r="2" fill="#0077A8" />
              <defs>
                <linearGradient id="cyan-gradient" x1="20" y1="5" x2="20" y2="25">
                  <stop offset="0%" stopColor="#00D4FF" />
                  <stop offset="100%" stopColor="#0077A8" />
                </linearGradient>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
            </svg>
            <div className="text-2xl font-black" style={{ fontFamily: "Syne, sans-serif" }}>
              <span className="text-white">Phan</span>
              <span className="text-[#00D4FF]">tera</span>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-white/60 hover:text-[#00D4FF] transition-colors">
              Features
            </a>
            <a href="#pricing" className="text-sm text-white/60 hover:text-[#00D4FF] transition-colors">
              Pricing
            </a>
            <a href="#faq" className="text-sm text-white/60 hover:text-[#00D4FF] transition-colors">
              FAQ
            </a>
            <Button className="bg-[#00D4FF] text-black hover:bg-[#00D4FF]/90 font-medium">
              Get Started
            </Button>
          </div>

          <button
            className="md:hidden text-white"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="md:hidden mt-4 pb-4 flex flex-col gap-4"
          >
            <a href="#features" className="text-sm text-white/60 hover:text-[#00D4FF]">
              Features
            </a>
            <a href="#pricing" className="text-sm text-white/60 hover:text-[#00D4FF]">
              Pricing
            </a>
            <a href="#faq" className="text-sm text-white/60 hover:text-[#00D4FF]">
              FAQ
            </a>
            <Button className="bg-[#00D4FF] text-black hover:bg-[#00D4FF]/90">
              Get Started
            </Button>
          </motion.div>
        )}
      </nav>
    </header>
  );
};

// Hero Section
const Hero = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
      <NeuralNetwork />
      
      <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#00D4FF]/30 bg-[#0A0A14]/50 backdrop-blur-sm mb-8">
            <Sparkles className="w-4 h-4 text-[#00D4FF]" />
            <span className="text-sm text-white/80">AI-Powered Lead Generation</span>
          </div>

          <h1
            className="text-5xl md:text-7xl font-black mb-6 leading-tight"
            style={{ fontFamily: "Syne, sans-serif" }}
          >
            <span className="bg-gradient-to-b from-white via-white to-white/60 bg-clip-text text-transparent">
              Your autonomous AI sales team.
            </span>
            <br />
            <span className="text-[#00D4FF]">Works 24/7.</span>
          </h1>

          <p className="text-lg md:text-xl text-white/60 mb-10 max-w-2xl mx-auto font-light" style={{ fontFamily: "Inter, sans-serif" }}>
            Automate B2B lead generation with AI agents that prospect, enrich, score, and engage leads while you sleep.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <Button className="bg-[#00D4FF] text-black hover:bg-[#00D4FF]/90 px-8 py-6 text-lg font-semibold">
              Start Free Trial
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
            <Button variant="outline" className="border-white/20 text-white hover:bg-white/10 px-8 py-6 text-lg">
              Watch Demo
            </Button>
          </div>

          <div className="flex items-center justify-center gap-8 text-white/40 text-sm">
            <span>Trusted by 500+ companies</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

// Stats Bar
const StatsBar = () => {
  const stats = [
    { value: "10M+", label: "Leads Generated" },
    { value: "40%", label: "Open Rate" },
    { value: "15%", label: "Reply Rate" },
    { value: "€0.03", label: "Cost per Lead" },
  ];

  return (
    <section className="py-16 border-y border-white/5">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="text-center"
            >
              <div className="text-3xl md:text-4xl font-black text-[#00D4FF] mb-2" style={{ fontFamily: "Syne, sans-serif" }}>
                {stat.value}
              </div>
              <div className="text-sm text-white/60" style={{ fontFamily: "Inter, sans-serif" }}>
                {stat.label}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

// How It Works
const HowItWorks = () => {
  const steps = [
    { icon: Target, title: "Prospector", description: "AI finds your ideal customers across multiple data sources" },
    { icon: Database, title: "Enricher", description: "Enriches leads with verified contact data and company insights" },
    { icon: TrendingUp, title: "Scorer", description: "Scores leads based on fit and buying intent signals" },
    { icon: Mail, title: "Copywriter", description: "Generates personalized outreach messages at scale" },
    { icon: MessageSquare, title: "Reply Handler", description: "Manages responses and books meetings automatically" },
  ];

  return (
    <section className="py-24 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-black mb-4" style={{ fontFamily: "Syne, sans-serif" }}>
            <span className="text-white">How It </span>
            <span className="text-[#00D4FF]">Works</span>
          </h2>
          <p className="text-white/60 text-lg" style={{ fontFamily: "Inter, sans-serif" }}>
            Five AI agents working together to automate your entire sales pipeline
          </p>
        </motion.div>

        <div className="flex overflow-x-auto gap-6 pb-8 snap-x snap-mandatory scrollbar-hide">
          {steps.map((step, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="min-w-[280px] snap-center bg-[#0A0A14] border border-white/10 rounded-2xl p-6 hover:border-[#00D4FF]/50 transition-all"
            >
              <div className="w-12 h-12 rounded-xl bg-[#00D4FF]/10 flex items-center justify-center mb-4">
                <step.icon className="w-6 h-6 text-[#00D4FF]" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2" style={{ fontFamily: "Syne, sans-serif" }}>
                {step.title}
              </h3>
              <p className="text-white/60 text-sm" style={{ fontFamily: "Inter, sans-serif" }}>
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

// Features Bento Grid
const Features = () => {
  const features = [
    {
      icon: Zap,
      title: "Lightning Fast",
      description: "Process thousands of leads in minutes with AI-powered automation",
      colSpan: 2,
    },
    {
      icon: Target,
      title: "Precision Targeting",
      description: "Find your ICP with advanced filters and AI matching",
    },
    {
      icon: Database,
      title: "Data Enrichment",
      description: "Enrich leads with 50+ data points from multiple sources",
      colSpan: 2,
    },
    {
      icon: Mail,
      title: "Smart Outreach",
      description: "AI-generated personalized messages that convert",
    },
    {
      icon: TrendingUp,
      title: "Analytics Dashboard",
      description: "Track performance with real-time insights and reporting",
    },
    {
      icon: Users,
      title: "Team Collaboration",
      description: "Work together seamlessly with shared workspaces",
    },
  ];

  return (
    <section id="features" className="py-24">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-black mb-4" style={{ fontFamily: "Syne, sans-serif" }}>
            <span className="text-white">Powerful </span>
            <span className="text-[#00D4FF]">Features</span>
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={cn(
                "group relative p-6 rounded-2xl overflow-hidden transition-all duration-300",
                "border border-white/10 bg-[#0A0A14]",
                "hover:border-[#00D4FF]/50 hover:-translate-y-1",
                feature.colSpan === 2 ? "md:col-span-2" : ""
              )}
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,212,255,0.05)_1px,transparent_1px)] bg-[length:20px_20px] opacity-0 group-hover:opacity-100 transition-opacity" />
              
              <div className="relative">
                <div className="w-12 h-12 rounded-xl bg-[#00D4FF]/10 flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-[#00D4FF]" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2" style={{ fontFamily: "Syne, sans-serif" }}>
                  {feature.title}
                </h3>
                <p className="text-white/60 text-sm" style={{ fontFamily: "Inter, sans-serif" }}>
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

// Pricing
const Pricing = () => {
  const plans = [
    {
      name: "Free",
      price: "€0",
      description: "Perfect for testing",
      features: ["100 leads/month", "Basic enrichment", "Email support"],
      cta: "Start Free",
      popular: false,
    },
    {
      name: "Pro",
      price: "€49",
      description: "For growing teams",
      features: ["5,000 leads/month", "Advanced enrichment", "Priority support", "API access"],
      cta: "Start Pro",
      popular: true,
    },
    {
      name: "Enterprise",
      price: "€149",
      description: "For scale",
      features: ["Unlimited leads", "Custom integrations", "Dedicated support", "SLA guarantee"],
      cta: "Contact Sales",
      popular: false,
      gold: true,
    },
  ];

  return (
    <section id="pricing" className="py-24">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-black mb-4" style={{ fontFamily: "Syne, sans-serif" }}>
            <span className="text-white">Simple </span>
            <span className="text-[#00D4FF]">Pricing</span>
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {plans.map((plan, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={cn(
                "relative p-8 rounded-2xl bg-[#0A0A14] border",
                plan.popular ? "border-[#00D4FF] shadow-lg shadow-[#00D4FF]/20" : plan.gold ? "border-[#F0B429]" : "border-white/10"
              )}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-[#00D4FF] text-black text-sm font-bold rounded-full">
                  Popular
                </div>
              )}
              
              <div className="mb-6">
                <h3 className="text-2xl font-black text-white mb-2" style={{ fontFamily: "Syne, sans-serif" }}>
                  {plan.name}
                </h3>
                <p className="text-white/60 text-sm mb-4" style={{ fontFamily: "Inter, sans-serif" }}>
                  {plan.description}
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-black text-white" style={{ fontFamily: "Syne, sans-serif" }}>
                    {plan.price}
                  </span>
                  <span className="text-white/60">/month</span>
                </div>
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-center gap-2 text-white/80 text-sm">
                    <CheckCircle className="w-5 h-5 text-[#00D4FF] flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              <Button
                className={cn(
                  "w-full",
                  plan.popular
                    ? "bg-[#00D4FF] text-black hover:bg-[#00D4FF]/90"
                    : plan.gold
                    ? "bg-[#F0B429] text-black hover:bg-[#F0B429]/90"
                    : "bg-white/10 text-white hover:bg-white/20"
                )}
              >
                {plan.cta}
              </Button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

// Testimonials
const Testimonials = () => {
  const testimonials = [
    {
      quote: "Phantera helped us generate 10,000+ qualified leads in the first month. Game changer.",
      author: "Sarah Chen",
      role: "Head of Sales, TechCorp",
    },
    {
      quote: "The AI agents work better than our entire SDR team. We've 3x'd our pipeline.",
      author: "Marcus Johnson",
      role: "Founder, GrowthLabs",
    },
    {
      quote: "Best investment we've made. ROI was positive within 2 weeks.",
      author: "Emma Williams",
      role: "CMO, SalesForce Pro",
    },
  ];

  return (
    <section className="py-24 bg-[#0A0A14]/50">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-black mb-4" style={{ fontFamily: "Syne, sans-serif" }}>
            <span className="text-white">Loved by </span>
            <span className="text-[#00D4FF]">Thousands</span>
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="p-6 rounded-2xl bg-[#0A0A14] border border-white/10"
            >
              <p className="text-white/80 mb-6 italic" style={{ fontFamily: "Inter, sans-serif" }}>
                "{testimonial.quote}"
              </p>
              <div>
                <div className="font-bold text-white" style={{ fontFamily: "Syne, sans-serif" }}>
                  {testimonial.author}
                </div>
                <div className="text-sm text-white/60" style={{ fontFamily: "Inter, sans-serif" }}>
                  {testimonial.role}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

// FAQ
const FAQ = () => {
  const faqs = [
    {
      question: "How does Phantera find leads?",
      answer: "Our AI agents search across 50+ data sources including LinkedIn, company databases, and public records to find your ideal customers.",
    },
    {
      question: "Is the data GDPR compliant?",
      answer: "Yes, all data is sourced from public and opt-in databases. We're fully GDPR compliant and respect all privacy regulations.",
    },
    {
      question: "Can I integrate with my CRM?",
      answer: "Absolutely! We integrate with all major CRMs including Salesforce, HubSpot, and Pipedrive via API.",
    },
    {
      question: "What's the average response rate?",
      answer: "Our customers see an average 15% reply rate, which is 3x higher than traditional cold email campaigns.",
    },
    {
      question: "Do you offer a free trial?",
      answer: "Yes! Start with our Free plan to test the platform with 100 leads per month. No credit card required.",
    },
    {
      question: "How long does setup take?",
      answer: "Most customers are up and running in under 10 minutes. Our onboarding wizard guides you through the entire process.",
    },
  ];

  return (
    <section id="faq" className="py-24">
      <div className="max-w-3xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-black mb-4" style={{ fontFamily: "Syne, sans-serif" }}>
            <span className="text-white">Frequently Asked </span>
            <span className="text-[#00D4FF]">Questions</span>
          </h2>
        </motion.div>

        <Accordion type="single" collapsible className="space-y-4">
          {faqs.map((faq, index) => (
            <AccordionItem
              key={index}
              value={`item-${index}`}
              className="border border-white/10 rounded-xl px-6 bg-[#0A0A14]"
            >
              <AccordionTrigger className="text-white hover:text-[#00D4FF] text-left font-semibold" style={{ fontFamily: "Syne, sans-serif" }}>
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-white/60" style={{ fontFamily: "Inter, sans-serif" }}>
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
};

// Contact
const Contact = () => {
  return (
    <section className="py-24 bg-[#0A0A14]/50">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
        >
          <h2 className="text-4xl md:text-5xl font-black mb-6" style={{ fontFamily: "Syne, sans-serif" }}>
            <span className="text-white">Ready to </span>
            <span className="text-[#00D4FF]">10x Your Pipeline?</span>
          </h2>
          <p className="text-white/60 text-lg mb-8" style={{ fontFamily: "Inter, sans-serif" }}>
            Join 500+ companies using Phantera to automate their lead generation
          </p>
          <Button className="bg-[#00D4FF] text-black hover:bg-[#00D4FF]/90 px-8 py-6 text-lg font-semibold">
            Start Free Trial
            <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </motion.div>
      </div>
    </section>
  );
};

// Footer
const Footer = () => {
  return (
    <footer className="border-t border-white/5 py-12">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <svg width="32" height="32" viewBox="0 0 40 40" fill="none">
                <path d="M20 5L30 15L20 25L10 15L20 5Z" fill="#00D4FF" />
              </svg>
              <div className="text-xl font-black" style={{ fontFamily: "Syne, sans-serif" }}>
                <span className="text-white">Phan</span>
                <span className="text-[#00D4FF]">tera</span>
              </div>
            </div>
            <p className="text-white/60 text-sm" style={{ fontFamily: "Inter, sans-serif" }}>
              Autonomous AI lead generation platform
            </p>
          </div>

          <div>
            <h4 className="text-white font-bold mb-4" style={{ fontFamily: "Syne, sans-serif" }}>Product</h4>
            <ul className="space-y-2 text-sm text-white/60" style={{ fontFamily: "Inter, sans-serif" }}>
              <li><a href="#features" className="hover:text-[#00D4FF]">Features</a></li>
              <li><a href="#pricing" className="hover:text-[#00D4FF]">Pricing</a></li>
              <li><a href="#" className="hover:text-[#00D4FF]">Integrations</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-bold mb-4" style={{ fontFamily: "Syne, sans-serif" }}>Company</h4>
            <ul className="space-y-2 text-sm text-white/60" style={{ fontFamily: "Inter, sans-serif" }}>
              <li><a href="#" className="hover:text-[#00D4FF]">About</a></li>
              <li><a href="#" className="hover:text-[#00D4FF]">Blog</a></li>
              <li><a href="#" className="hover:text-[#00D4FF]">Careers</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-bold mb-4" style={{ fontFamily: "Syne, sans-serif" }}>Legal</h4>
            <ul className="space-y-2 text-sm text-white/60" style={{ fontFamily: "Inter, sans-serif" }}>
              <li><a href="#" className="hover:text-[#00D4FF]">Privacy</a></li>
              <li><a href="#" className="hover:text-[#00D4FF]">Terms</a></li>
              <li><a href="#" className="hover:text-[#00D4FF]">Security</a></li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between pt-8 border-t border-white/5">
          <p className="text-white/40 text-sm" style={{ fontFamily: "Inter, sans-serif" }}>
            © 2024 Phantera. All rights reserved.
          </p>
          <div className="flex items-center gap-4 mt-4 md:mt-0">
            <a href="#" className="text-white/40 hover:text-[#00D4FF]">
              <Twitter className="w-5 h-5" />
            </a>
            <a href="#" className="text-white/40 hover:text-[#00D4FF]">
              <Linkedin className="w-5 h-5" />
            </a>
            <a href="#" className="text-white/40 hover:text-[#00D4FF]">
              <Github className="w-5 h-5" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

// Main Component
function PhanteraLanding() {
  return (
    <div className="min-h-screen bg-[#050508] text-white overflow-x-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@800&family=Inter:wght@300;400&display=swap');
        
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
      
      <CustomCursor />
      <ScrollProgress />
      <Navigation />
      <Hero />
      <StatsBar />
      <HowItWorks />
      <Features />
      <Pricing />
      <Testimonials />
      <FAQ />
      <Contact />
      <Footer />
    </div>
  );
}

export default PhanteraLanding;
