import {
  Atom,
  BookA,
  BookOpen,
  Brain,
  Calculator,
  Code,
  FlaskConical,
  Globe,
  Languages,
  Landmark,
  Microscope,
  PenTool,
  Sigma,
  type LucideIcon,
} from "lucide-react";

export const SUBJECT_ICONS: Record<string, LucideIcon> = {
  "book-open": BookOpen,
  sigma: Sigma,
  atom: Atom,
  "flask-conical": FlaskConical,
  languages: Languages,
  "book-a": BookA,
  calculator: Calculator,
  globe: Globe,
  landmark: Landmark,
  microscope: Microscope,
  "pen-tool": PenTool,
  brain: Brain,
  code: Code,
};

export function SubjectIcon({ name, className, color }: { name: string; className?: string; color?: string }) {
  const Icon = SUBJECT_ICONS[name] ?? BookOpen;
  return <Icon className={className} style={color ? { color } : undefined} aria-hidden />;
}
