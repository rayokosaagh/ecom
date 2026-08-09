"use client";

import { useActionState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { TextField } from "@/components/ui/TextField";
import { TextArea } from "@/components/ui/TextArea";
import {
  MAX_ANSWER_LENGTH,
  MAX_QUESTION_LENGTH,
} from "@/lib/faqs/validation";
import type { FaqFormState } from "@/lib/actions/faqs";

export interface FaqFormValues {
  question: string;
  answer: string;
  published: boolean;
}

const INITIAL: FaqFormState = {};

/**
 * Create or edit one question.
 *
 * The action is passed in already bound to an id where there is one, so this
 * component never needs to know which of the two it is doing — the same shape
 * the spec and banner forms use.
 */
export function FaqForm({
  action,
  values,
  submitLabel,
}: {
  action: (state: FaqFormState, formData: FormData) => Promise<FaqFormState>;
  values: FaqFormValues;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {state.message && (
        <div
          role="alert"
          className="bg-error-container text-on-error-container flex items-start gap-3 rounded-md px-4 py-3 text-sm"
        >
          <Icon name="error" size={20} className="mt-px" />
          <span>{state.message}</span>
        </div>
      )}

      <Card variant="outlined">
        <CardContent className="space-y-5">
          <TextField
            label="Question"
            name="question"
            defaultValue={values.question}
            maxLength={MAX_QUESTION_LENGTH}
            supportingText="What a shopper would actually type or ask."
            error={state.errors?.question}
            required
          />

          <TextArea
            label="Answer"
            name="answer"
            rows={8}
            defaultValue={values.answer}
            maxLength={MAX_ANSWER_LENGTH}
            // Said plainly because the field looks like it might take markup.
            supportingText="Plain text. Blank lines become paragraphs; HTML is not rendered."
            error={state.errors?.answer}
            required
          />

          {/* An unchecked box submits nothing at all, which is exactly how the
              parser reads "not published". */}
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              name="published"
              defaultChecked={values.published}
              className="accent-primary size-4"
            />
            <span className="text-on-surface text-sm">
              Published
              <span className="text-on-surface-variant block text-xs">
                Unpublished questions stay here but are hidden on the home page.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Link
          href="/admin/faqs"
          className="text-on-surface-variant rounded-sm text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
