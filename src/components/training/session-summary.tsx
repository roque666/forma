import Link from 'next/link';
import { Camera, Trophy, Pencil, Trash2 } from 'lucide-react';
import type { PrEventRow, SessionDetail } from '@/lib/data/sessions';
import { exerciseStats, sessionTotals } from '@/lib/training/metrics';
import { Card, CardTitle, PageHeader } from '@/components/ui/card';
import { Badge, Stat } from '@/components/ui/feedback';
import { LinkButton } from '@/components/ui/button';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { CommentForm, CorrectSetForm } from './session-coach-forms';
import { deleteSessionAction } from '@/lib/actions/training';
import { fmtNum, MUSCLE_LABELS, prValueText, PR_LABELS } from '@/lib/labels';
import { formatDateTimePt, formatDuration } from '@/lib/dates';

interface Props {
  detail: SessionDetail;
  prs: PrEventRow[];
  comments: { id: string; authorName: string; body: string; createdAt: string }[];
  corrections: { id: string; recordId: string; correctedByName: string | null; oldValues: Record<string, any>; newValues: Record<string, any>; reason: string; createdAt: string }[];
  viewer: { id: string; role: 'student' | 'coach' | 'physio'; timezone: string };
  studentName?: string;
  backHref: string;
  editHref?: string;
}

export function SessionSummary({ detail, prs, comments, corrections, viewer, studentName, backHref, editHref }: Props) {
  const totals = sessionTotals(detail.exercises);
  const seconds = detail.endedAt ? Math.round((new Date(detail.endedAt).getTime() - new Date(detail.startedAt).getTime()) / 1000) : null;
  const isOwner = viewer.id === detail.studentId;
  const isCoach = viewer.role === 'coach' && !isOwner;
  const prBySet = new Set(prs.map((p) => p.setId));
  return (
    <>
      <PageHeader title={detail.dayName ?? detail.planName ?? 'Treino livre'} back={{ href: backHref, label: 'Voltar' }}
        subtitle={<>{studentName && <strong className="text-fg">{studentName} · </strong>}{formatDateTimePt(detail.startedAt, viewer.timezone)}{detail.planName && detail.dayName ? ` · ${detail.planName}` : ''}{detail.status === 'discarded' && ' · descartado'}</>}
        actions={isOwner && editHref ? <LinkButton href={editHref} variant="outline"><Pencil className="h-4 w-4" /> Editar</LinkButton> : undefined} />
      <Card className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Duração" value={formatDuration(seconds)} />
        <Stat label="Séries" value={totals.workingSets} />
        <Stat label="Reps" value={fmtNum(totals.totalReps, 0)} />
        <Stat label="Volume" value={fmtNum(totals.volumeKg, 0)} unit="kg" />
      </Card>
      {isOwner && detail.status === 'completed' && detail.endedAt && Date.now() - new Date(detail.endedAt).getTime() < 6 * 3_600_000 && (
        <Card className="mb-4 flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm"><Camera className="h-4 w-4 shrink-0 text-accent-text" /> Queres registar uma foto do corpo de hoje?</p>
          <LinkButton href="/photos#nova" variant="outline" size="sm">Tirar foto</LinkButton>
        </Card>
      )}
      {prs.length > 0 && (
        <Card className="mb-4 border-accent-text/40">
          <CardTitle>Recordes neste treino 🏆</CardTitle>
          <ul className="space-y-2">
            {prs.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2"><Trophy className="h-4 w-4 shrink-0 text-accent-text" /><span className="truncate font-medium">{p.exerciseName}</span><Badge>{PR_LABELS[p.prType]}</Badge></span>
                <span className="shrink-0 tabular-nums"><span className="text-muted line-through">{fmtNum(p.previousValue, 1)}</span> → <strong>{prValueText(p.prType, p.value, p.weightKg, p.reps)}</strong></span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {detail.notes && <Card className="mb-4"><CardTitle>Notas</CardTitle><p className="whitespace-pre-wrap text-sm">{detail.notes}</p></Card>}
      <div className="space-y-3">
        {detail.exercises.map((e) => {
          const st = exerciseStats(e.sets);
          return (
            <Card key={e.id}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0"><h2 className="truncate font-bold">{e.exerciseName}</h2><p className="text-xs text-muted">{e.primaryMuscle ? MUSCLE_LABELS[e.primaryMuscle] : ''}</p></div>
                <div className="text-right text-xs text-muted"><p>{fmtNum(st.volumeKg, 0)} kg</p>{st.bestE1rm && <p>1RM est. {fmtNum(st.bestE1rm, 1)} kg</p>}</div>
              </div>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs uppercase text-muted"><th className="py-1 font-medium">#</th><th className="font-medium">Peso</th><th className="font-medium">Reps</th><th className="font-medium">RIR</th><th /></tr></thead>
                <tbody className="divide-y divide-line">
                  {e.sets.filter((s) => s.completed).map((s) => (
                    <tr key={s.id} className="align-top">
                      <td className="py-2 tabular-nums">{s.setType === 'warmup' ? 'A' : s.setNumber}</td>
                      <td className="tabular-nums">{s.weightKg != null ? `${fmtNum(s.weightKg, 2)} kg` : '—'}</td>
                      <td className="tabular-nums">{s.reps ?? '—'}</td>
                      <td className="tabular-nums">{s.rir ?? '—'}</td>
                      <td className="text-right">
                        {prBySet.has(s.id) && <Badge tone="accent"><Trophy className="h-3 w-3" /> PR</Badge>}
                        {s.correctedAt && <Badge tone="warn" className="ml-1">Corrigido</Badge>}
                        {isCoach && detail.status === 'completed' && (
                          <details className="mt-1 text-left"><summary className="cursor-pointer text-right text-xs text-muted">Corrigir</summary><div className="mt-2"><CorrectSetForm sessionId={detail.id} set={s} /></div></details>
                        )}
                      </td>
                    </tr>
                  ))}
                  {e.sets.every((s) => !s.completed) && <tr><td colSpan={5} className="py-2 text-muted">Nenhuma série concluída.</td></tr>}
                </tbody>
              </table>
            </Card>
          );
        })}
        {detail.exercises.length === 0 && <Card className="text-center text-muted">Sem exercícios registados.</Card>}
      </div>
      {corrections.length > 0 && (
        <Card className="mt-4">
          <CardTitle>Correções registadas</CardTitle>
          <ul className="space-y-2 text-sm">
            {corrections.map((c) => (
              <li key={c.id}><span className="font-medium">{c.correctedByName ?? 'Coach'}</span> <span className="text-muted">({formatDateTimePt(c.createdAt, viewer.timezone)})</span>: {c.reason}
                <span className="block text-xs text-muted">Antes: {fmtNum(c.oldValues.weight_kg, 2)} kg × {c.oldValues.reps ?? '—'} → Depois: {fmtNum(c.newValues.weight_kg, 2)} kg × {c.newValues.reps ?? '—'}</span></li>
            ))}
          </ul>
        </Card>
      )}
      <Card className="mt-4">
        <CardTitle>Comentários do coach</CardTitle>
        {comments.length === 0 ? <p className="mb-3 text-sm text-muted">Sem comentários.</p> : (
          <ul className="mb-4 space-y-3">{comments.map((c) => (<li key={c.id} className="rounded-xl bg-surface2 px-3 py-2 text-sm"><p className="mb-0.5 text-xs text-muted">{c.authorName} · {formatDateTimePt(c.createdAt, viewer.timezone)}</p>{c.body}</li>))}</ul>
        )}
        {isCoach && <CommentForm sessionId={detail.id} />}
      </Card>
      {isOwner && (
        <form action={deleteSessionAction} className="mt-6"><input type="hidden" name="id" value={detail.id} /><ConfirmSubmit confirmLabel="Apagar este treino do histórico?"><Trash2 className="h-4 w-4" /> Apagar treino</ConfirmSubmit></form>
      )}
    </>
  );
}
