/**
 * White-Label Theme Presets
 * 4 predefined themes that override CSS variables.
 * Applied dynamically from DB config — no rebuild needed.
 */

export interface ThemePreset {
  key: string;
  label: string;
  description: string;
  variables: Record<string, string>;
  darkVariables: Record<string, string>;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    key: 'default',
    label: 'Default (ETC)',
    description: 'Warm neutral palette with teal accents — current Ethical Top Closer theme.',
    variables: {
      '--background': '40 20% 96%',
      '--foreground': '30 10% 12%',
      '--primary': '152 28% 20%',
      '--primary-foreground': '40 20% 96%',
      '--secondary': '35 14% 86%',
      '--secondary-foreground': '30 10% 12%',
      '--accent': '36 32% 52%',
      '--accent-foreground': '30 10% 12%',
      '--muted': '36 12% 90%',
      '--muted-foreground': '30 8% 46%',
      '--card': '0 0% 100%',
      '--card-foreground': '30 10% 12%',
      '--border': '36 14% 84%',
      '--ring': '152 28% 20%',
      '--sidebar-background': '220 15% 8%',
      '--sidebar-accent-fg': '39 41% 55%',
    },
    darkVariables: {
      '--background': '25 10% 8%',
      '--foreground': '36 15% 92%',
      '--primary': '36 32% 52%',
      '--primary-foreground': '25 10% 8%',
      '--card': '25 10% 11%',
      '--card-foreground': '36 15% 92%',
      '--border': '25 8% 20%',
    },
  },
  {
    key: 'income',
    label: 'Income',
    description: 'Dark, gold, performance-driven — for revenue-focused brands.',
    variables: {
      '--background': '220 15% 96%',
      '--foreground': '220 15% 10%',
      '--primary': '42 78% 48%',
      '--primary-foreground': '220 15% 8%',
      '--secondary': '220 10% 88%',
      '--secondary-foreground': '220 15% 10%',
      '--accent': '42 60% 52%',
      '--accent-foreground': '220 15% 8%',
      '--muted': '220 8% 90%',
      '--muted-foreground': '220 8% 46%',
      '--card': '0 0% 100%',
      '--card-foreground': '220 15% 10%',
      '--border': '220 10% 85%',
      '--ring': '42 78% 48%',
      '--sidebar-background': '220 20% 6%',
      '--sidebar-accent-fg': '42 78% 55%',
    },
    darkVariables: {
      '--background': '220 20% 6%',
      '--foreground': '42 30% 90%',
      '--primary': '42 78% 55%',
      '--primary-foreground': '220 20% 6%',
      '--card': '220 18% 10%',
      '--card-foreground': '42 30% 90%',
      '--border': '220 15% 16%',
    },
  },
  {
    key: 'lifestyle',
    label: 'Lifestyle',
    description: 'Light, soft, aspirational — for wellness and coaching brands.',
    variables: {
      '--background': '30 40% 97%',
      '--foreground': '340 10% 15%',
      '--primary': '340 45% 48%',
      '--primary-foreground': '0 0% 100%',
      '--secondary': '30 25% 90%',
      '--secondary-foreground': '340 10% 15%',
      '--accent': '18 60% 60%',
      '--accent-foreground': '340 10% 12%',
      '--muted': '30 20% 92%',
      '--muted-foreground': '340 6% 50%',
      '--card': '0 0% 100%',
      '--card-foreground': '340 10% 15%',
      '--border': '30 20% 86%',
      '--ring': '340 45% 48%',
      '--sidebar-background': '340 12% 10%',
      '--sidebar-accent-fg': '18 60% 60%',
    },
    darkVariables: {
      '--background': '340 12% 8%',
      '--foreground': '30 25% 90%',
      '--primary': '340 45% 55%',
      '--primary-foreground': '0 0% 100%',
      '--card': '340 10% 12%',
      '--card-foreground': '30 25% 90%',
      '--border': '340 8% 18%',
    },
  },
  {
    key: 'identity',
    label: 'Identity',
    description: 'Clean, minimal, premium — for luxury and corporate brands.',
    variables: {
      '--background': '0 0% 98%',
      '--foreground': '0 0% 8%',
      '--primary': '0 0% 12%',
      '--primary-foreground': '0 0% 98%',
      '--secondary': '0 0% 92%',
      '--secondary-foreground': '0 0% 12%',
      '--accent': '0 0% 40%',
      '--accent-foreground': '0 0% 98%',
      '--muted': '0 0% 94%',
      '--muted-foreground': '0 0% 45%',
      '--card': '0 0% 100%',
      '--card-foreground': '0 0% 8%',
      '--border': '0 0% 88%',
      '--ring': '0 0% 12%',
      '--sidebar-background': '0 0% 5%',
      '--sidebar-accent-fg': '0 0% 65%',
    },
    darkVariables: {
      '--background': '0 0% 5%',
      '--foreground': '0 0% 92%',
      '--primary': '0 0% 92%',
      '--primary-foreground': '0 0% 8%',
      '--card': '0 0% 9%',
      '--card-foreground': '0 0% 92%',
      '--border': '0 0% 16%',
    },
  },
];

export function getThemePreset(key: string): ThemePreset {
  return THEME_PRESETS.find(t => t.key === key) || THEME_PRESETS[0];
}
