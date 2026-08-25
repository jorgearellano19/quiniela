"use client";

import { useState, useTransition } from "react";
import { ChevronDownIcon, GripVerticalIcon, PlusIcon } from "lucide-react";
import type { QuestionEditor, RoundEditorDetail } from "@/application/round/use-cases";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  removeQuestionAction,
  reorderQuestionsAction,
} from "@/features/rounds/round-actions";
import { QuestionForm } from "@/features/rounds/round-editor-forms";
import { RoundConfirmButton } from "@/features/rounds/round-confirm-button";
import { LocalDateTime } from "@/features/rounds/local-date-time";

const typeLabels: Record<QuestionEditor["type"], string> = {
  MATCH_SCORE: "Marcador",
  CLOSEST_VALUE: "Valor más cercano",
  OPTIONS: "Opciones",
  OPEN_TEXT: "Texto abierto",
  EXACT_VALUE: "Valor exacto",
};

function questionTitle(question: QuestionEditor) {
  return question.type === "MATCH_SCORE"
    ? `${question.homeLabel} vs ${question.awayLabel}`
    : (question.prompt ?? "Pregunta");
}

export function QuestionWorkspace({
  competitionId,
  roundId,
  questions: initialQuestions,
  scoringDefaults,
  readOnly,
}: {
  competitionId: string;
  roundId: string;
  questions: readonly QuestionEditor[];
  scoringDefaults: RoundEditorDetail["scoringDefaults"];
  readOnly: boolean;
}) {
  const [questions, setQuestions] = useState([...initialQuestions]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function saveOrder(next: QuestionEditor[]) {
    const previous = questions;
    setQuestions(next);
    startTransition(async () => {
      const result = await reorderQuestionsAction(
        competitionId,
        roundId,
        next.map((question) => question.id),
      );
      if (!result.success) setQuestions(previous);
      setMessage(
        result.message ?? (result.success ? "Orden de preguntas guardado." : ""),
      );
    });
  }

  function move(id: string, offset: -1 | 1) {
    const from = questions.findIndex((question) => question.id === id);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= questions.length) return;
    const next = [...questions];
    const [question] = next.splice(from, 1);
    next.splice(to, 0, question!);
    saveOrder(next);
  }

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="grid gap-4" aria-labelledby="questions-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="questions-title" className="font-heading text-2xl">
            Preguntas
          </h2>
          {!readOnly && questions.length > 1 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Arrastra desde el control o usa las flechas para cambiar el orden.
            </p>
          ) : null}
        </div>
        {!readOnly ? (
          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={() => setAdding((current) => !current)}
          >
            <PlusIcon aria-hidden="true" data-icon="inline-start" />
            {adding ? "Cerrar" : "Agregar pregunta"}
          </Button>
        ) : null}
      </div>

      {adding ? (
        <Card className="border-primary/30">
          <CardContent className="pt-6">
            <QuestionForm
              competitionId={competitionId}
              roundId={roundId}
              nextSequence={(questions.at(-1)?.sequence ?? 0) + 1}
              scoringDefaults={scoringDefaults}
            />
          </CardContent>
        </Card>
      ) : null}

      <ol className="grid gap-3">
        {questions.map((question, index) => {
          const title = questionTitle(question);
          const isExpanded = expanded.has(question.id);
          return (
            <li
              key={question.id}
              onDragOver={(event) => {
                if (!readOnly) event.preventDefault();
              }}
              onDrop={() => {
                if (!draggedId || draggedId === question.id) return;
                const next = [...questions];
                const from = next.findIndex((item) => item.id === draggedId);
                const to = next.findIndex((item) => item.id === question.id);
                const [dragged] = next.splice(from, 1);
                next.splice(to, 0, dragged!);
                setDraggedId(null);
                saveOrder(next);
              }}
            >
              <Card className={draggedId === question.id ? "opacity-60" : undefined}>
                <div className="flex min-h-18 items-center gap-1 p-2 sm:min-h-20 sm:gap-2 sm:p-4">
                  {!readOnly ? (
                    <button
                      type="button"
                      draggable={!pending}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        setDraggedId(question.id);
                      }}
                      onDragEnd={() => setDraggedId(null)}
                      className="hidden min-h-11 min-w-11 cursor-grab items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing sm:flex"
                      aria-label={`Arrastrar ${title}`}
                    >
                      <GripVerticalIcon aria-hidden="true" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => toggle(question.id)}
                    className="flex min-h-12 min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-2 text-left focus-visible:ring-2 focus-visible:ring-ring"
                    aria-expanded={isExpanded}
                    aria-controls={`question-${question.id}`}
                  >
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                        {index + 1} · {typeLabels[question.type]}
                      </span>
                      <span className="mt-1 block truncate font-heading text-lg sm:text-xl">
                        {title}
                      </span>
                    </span>
                    <ChevronDownIcon
                      aria-hidden="true"
                      className={`shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    />
                  </button>
                  {!readOnly && questions.length > 1 ? (
                    <div className="hidden flex-col gap-1 sm:flex">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={pending || index === 0}
                        onClick={() => move(question.id, -1)}
                        aria-label={`Mover ${title} hacia arriba`}
                      >
                        ↑
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={pending || index === questions.length - 1}
                        onClick={() => move(question.id, 1)}
                        aria-label={`Mover ${title} hacia abajo`}
                      >
                        ↓
                      </Button>
                    </div>
                  ) : null}
                </div>
                {isExpanded ? (
                  <CardContent id={`question-${question.id}`} className="border-t pt-5">
                    {!readOnly && questions.length > 1 ? (
                      <div className="mb-5 flex gap-2 sm:hidden">
                        <Button
                          type="button"
                          className="flex-1"
                          variant="outline"
                          disabled={pending || index === 0}
                          onClick={() => move(question.id, -1)}
                        >
                          ↑ Mover arriba
                        </Button>
                        <Button
                          type="button"
                          className="flex-1"
                          variant="outline"
                          disabled={pending || index === questions.length - 1}
                          onClick={() => move(question.id, 1)}
                        >
                          ↓ Mover abajo
                        </Button>
                      </div>
                    ) : null}
                    <p className="mb-5 text-sm text-muted-foreground">
                      Cierra <LocalDateTime value={question.deadlineAt} />
                    </p>
                    {!readOnly ? (
                      <div className="grid gap-6">
                        <QuestionForm
                          competitionId={competitionId}
                          roundId={roundId}
                          nextSequence={question.sequence}
                          value={question}
                          scoringDefaults={scoringDefaults}
                        />
                        <div className="border-t pt-5">
                          <RoundConfirmButton
                            action={removeQuestionAction.bind(
                              null,
                              competitionId,
                              roundId,
                              question.id,
                            )}
                            label="Eliminar pregunta"
                            title="Eliminar pregunta"
                            description="La pregunta y su configuración se eliminarán del borrador."
                            variant="destructive"
                          />
                        </div>
                      </div>
                    ) : null}
                  </CardContent>
                ) : null}
              </Card>
            </li>
          );
        })}
      </ol>
      {!questions.length && !adding ? (
        <p className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
          Todavía no hay preguntas en esta jornada.
        </p>
      ) : null}
      {message ? (
        <p
          role={message === "Orden de preguntas guardado." ? "status" : "alert"}
          className="text-sm text-muted-foreground"
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}
