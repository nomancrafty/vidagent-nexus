import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Bot,
  Mail,
  Video,
  BarChart3,
  Users,
  Send,
  ArrowRight,
  CheckCircle2,
  Sparkles
} from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-border/50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                <Bot className="w-6 h-6 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold">Hiring AI Agents</span>
            </div>
            <div className="flex items-center gap-4">
              <Link to="/auth/login">
                <Button variant="ghost" className="font-medium">
                  Login
                </Button>
              </Link>
              <Link to="/auth/signup">
                <Button className="font-medium shadow-glow">
                  Get Started
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute top-40 right-1/4 w-80 h-80 bg-accent/10 rounded-full blur-3xl" />
        
        <div className="container mx-auto px-6 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6 animate-fade-in">
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-medium">AI-Powered Outreach Platform</span>
            </div>
            
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold leading-tight mb-6 animate-fade-in-up">
              Hire AI Agents that{' '}
              <span className="gradient-text">automate your outreach</span>, personalize engagement, and scale your business.
            </h1>
            
            <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
              Transform your lead generation with intelligent AI agents that find, verify, and engage prospects with personalized video messages.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
              <Link to="/auth/signup">
                <Button size="lg" className="text-lg px-8 py-6 shadow-glow btn-glow">
                  Get Started Free
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <Link to="/auth/login">
                <Button size="lg" variant="outline" className="text-lg px-8 py-6">
                  Login to Dashboard
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Problem vs Solution */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Traditional Outreach is <span className="text-destructive">Broken</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Manual processes can't keep up with modern sales demands
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* Problem */}
            <div className="bg-card rounded-2xl p-8 border border-destructive/20 card-hover">
              <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center mb-6">
                <span className="text-2xl">❌</span>
              </div>
              <h3 className="text-xl font-bold mb-4 text-destructive">The Problem</h3>
              <ul className="space-y-3">
                {[
                  'Hours wasted manually finding and verifying emails',
                  'Generic outreach that gets ignored',
                  'No personalization at scale',
                  'Low response rates and poor ROI',
                  'Inconsistent follow-up sequences'
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-muted-foreground">
                    <span className="text-destructive mt-1">•</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            
            {/* Solution */}
            <div className="bg-card rounded-2xl p-8 border border-success/20 card-hover">
              <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center mb-6">
                <span className="text-2xl">✓</span>
              </div>
              <h3 className="text-xl font-bold mb-4 text-success">Our Solution</h3>
              <ul className="space-y-3">
                {[
                  'AI agents find and verify emails automatically',
                  'Personalized video messages for each prospect',
                  'Automated campaign sequences',
                  '3x higher response rates on average',
                  'Scale outreach without scaling costs'
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-muted-foreground">
                    <CheckCircle2 className="w-5 h-5 text-success mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Powerful Features for <span className="gradient-text">Modern Sales Teams</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Everything you need to automate and personalize your outreach at scale
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {[
              {
                icon: Users,
                title: 'CSV Lead Management',
                description: 'Drag-and-drop CSV uploads with strict column validation. Leads are grouped into batches you can review, search, and delete in one click.'
              },
              {
                icon: Mail,
                title: 'Email Verification',
                description: 'Bulk-verify every prospect through MillionVerifier. Valid, invalid, and catch-all addresses are flagged automatically — only valid leads move forward.'
              },
              {
                icon: Sparkles,
                title: 'AI Script Generation',
                description: 'Google Gemini writes a unique 60-second video script for each prospect, personalized from their company description and your campaign pitch.'
              },
              {
                icon: Video,
                title: 'Personalized Avatar Video',
                description: 'Puppeteer records a scrolling capture of the prospect’s website, then HeyGen overlays a circle AI avatar that speaks the script — one unique video per lead.'
              },
              {
                icon: Send,
                title: 'Cold Email Campaigns',
                description: 'Launch ManyReach campaigns in four steps: create list, create campaign, bulk add prospects with the personalized video link, and start sending.'
              },
              {
                icon: BarChart3,
                title: 'Real-time Analytics',
                description: 'Sent, opens, clicks, replies, and bounces sync from ManyReach every 15 minutes into the dashboard, with funnel and KPI charts powered by Recharts.'
              }
            ].map((feature, i) => (
              <div 
                key={i} 
                className="bg-card rounded-2xl p-6 border border-border card-hover"
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto text-center bg-gradient-to-r from-primary to-accent rounded-3xl p-12 relative overflow-hidden">
            <div className="absolute inset-0 bg-[url('/placeholder.svg')] opacity-5" />
            <div className="relative z-10">
              <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground mb-4">
                Ready to Transform Your Outreach?
              </h2>
              <p className="text-xl text-primary-foreground/80 mb-8 max-w-2xl mx-auto">
                Join thousands of sales teams using AI to personalize their outreach and close more deals.
              </p>
              <Link to="/auth/signup">
                <Button size="lg" variant="secondary" className="text-lg px-8 py-6">
                  Start
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <Bot className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-bold">Hiring AI Agents Platform</span>
            </div>
            
            <div className="text-center md:text-right">
              <p className="text-muted-foreground">
                A Final Year Project
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                © {new Date().getFullYear()} All rights reserved.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
