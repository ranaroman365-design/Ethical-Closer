import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { THEME_PRESETS } from '@/lib/theme-presets';
import { cn } from '@/lib/utils';
import { Check, Upload } from 'lucide-react';
import type { BrandConfig } from '@/hooks/useBrandConfig';

interface Props {
  branding: BrandConfig;
  onSave: (branding: BrandConfig) => Promise<void>;
  saving: boolean;
}

export default function BrandSettings({ branding, onSave, saving }: Props) {
  const [productName, setProductName] = useState(branding.product_name);
  const [themeKey, setThemeKey] = useState(branding.theme_key);
  const [logoUrl, setLogoUrl] = useState(branding.logo_url || '');

  const handleSave = () => {
    onSave({
      product_name: productName,
      theme_key: themeKey,
      logo_url: logoUrl || null,
    });
  };

  return (
    <div className="space-y-6">
      {/* Product Name */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Produktname</CardTitle>
          <CardDescription>
            Wird global in Navigation, Onboarding, E-Mails und Überschriften verwendet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="product-name">Name</Label>
            <Input
              id="product-name"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="z.B. Revenue Academy"
              maxLength={60}
            />
            <p className="text-xs text-muted-foreground">{productName.length}/60 Zeichen</p>
          </div>
        </CardContent>
      </Card>

      {/* Logo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Logo</CardTitle>
          <CardDescription>
            Wird in Navbar, Login und Dashboard angezeigt. URL zu einer Bilddatei eingeben.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Label htmlFor="logo-url">Logo URL</Label>
            <div className="flex gap-2">
              <Input
                id="logo-url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://example.com/logo.png"
              />
              <Button variant="outline" size="icon" disabled>
                <Upload className="h-4 w-4" />
              </Button>
            </div>
            {logoUrl && (
              <div className="mt-2 flex h-12 w-12 items-center justify-center rounded-md border bg-muted">
                <img src={logoUrl} alt="Logo preview" className="h-10 w-10 object-contain" />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Theme Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Farbschema</CardTitle>
          <CardDescription>
            Wähle ein vordefiniertes Farbthema. Wird sofort nach dem Speichern angewendet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {THEME_PRESETS.map((preset) => (
              <button
                key={preset.key}
                onClick={() => setThemeKey(preset.key)}
                className={cn(
                  'relative flex flex-col rounded-lg border-2 p-4 text-left transition-all',
                  themeKey === preset.key
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-border hover:border-muted-foreground/30'
                )}
              >
                {themeKey === preset.key && (
                  <div className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                    <Check className="h-3 w-3 text-primary-foreground" />
                  </div>
                )}
                {/* Color preview chips */}
                <div className="mb-2 flex gap-1.5">
                  {['--primary', '--accent', '--background', '--foreground'].map((v) => (
                    <div
                      key={v}
                      className="h-5 w-5 rounded-full border border-border"
                      style={{ backgroundColor: `hsl(${preset.variables[v]})` }}
                    />
                  ))}
                </div>
                <span className="text-sm font-semibold text-foreground">{preset.label}</span>
                <span className="mt-0.5 text-xs text-muted-foreground">{preset.description}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Speichern…' : 'Branding speichern'}
        </Button>
      </div>
    </div>
  );
}
