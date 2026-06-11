import { Card, CardContent } from '@/components/ui/card';
import { Construction } from 'lucide-react';

export default function Placeholder({ title, dia }: { title: string; dia?: string }) {
  return (
    <div className="space-y-6">
      <h1 className="font-display text-h1 text-ink">{title}</h1>
      <Card>
        <CardContent className="flex items-center gap-4 py-10">
          <div className="grid size-12 place-items-center rounded-lg bg-gold-500/10 text-gold-600">
            <Construction className="size-6" />
          </div>
          <div>
            <p className="font-medium text-ink">Em construção</p>
            <p className="text-sm text-muted-foreground">
              Esta tela chega {dia ? `no ${dia}` : 'em breve'} (frontend Dias 9-13).
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
