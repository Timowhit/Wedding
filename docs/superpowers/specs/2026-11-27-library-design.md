# Messages and questionnaires library: design

Status: built at the product owner's request ("keep building the next items in notes") · 2026-11-27 · branch `library`

This covers the notes item "Reusable questionnaires, proposals, email messages, and follow-up templates". Choices the product owner didn't make are marked _(call)_.

## Message templates

- **What they are:** a person's own templates, like checklist templates (scoped by `user_id`, never shared with a wedding).
- **Kinds:** email, follow-up and proposal _(call: a proposal is a text template too, for now; priced line items can come later)_.
- **Fields:** a name, an optional subject and a body.
- **Placeholders:**
  - `{couple}` is the wedding's name.
  - `{date}` is its date, written out in the reader's language.
  - `{days_left}` is the number of days until the wedding.
  - `{planner}` is your business name, or your own name.
  - Unknown placeholders stay as written.
- **Using one:** "Use for this wedding" (`GET /library/messages/:id/use`, needs at least editor rights) shows the filled subject and body. From there you can:
  - copy them with JavaScript
  - open them in your email app (a `mailto:` link to the wedding's other members)
  - print them, which also serves proposals
- **Sending:** none from the server _(call: avoids becoming an email sender the app is responsible for)_.

## Questionnaires

- **The template:** a person's own questionnaire has a title, an introduction and up to 30 questions. Each question is short text, long text or a choice of options (one per line).
- **The editing form:** shows the saved questions plus 3 empty rows, and works without JavaScript. Empty rows are dropped.
- **Sending:** "Send to this wedding" copies the questions into `wedding_questionnaires`. Only the person who asks decisions in that wedding can send or remove a questionnaire (the planner; editors in a couple's own wedding), so a client can't delete their own answers. Later edits to the template don't change what was sent.
- **Answering:**
  - Everyone in the wedding sees it under Questionnaires (`/questionnaires`).
  - The people who answer decisions answer it (`decisionPermissions(wedding).canAnswer`): the couple in planner weddings, editors in couples' own weddings.
  - Answers can be saved more than once. The last save wins and records who saved it and when.
  - Planners see the answers on the same page.
- **Validation:** text answers are up to 2000 characters. A choice answer must be one of the question's options.

## Navigation

- Library is listed for planners only; couples rarely need it, though the route works for any account.
- Questionnaires is listed in planner weddings, and for planners in any wedding they belong to.

## Limits

- 100 message templates and 50 questionnaires per person
- message bodies up to 10,000 characters
- names and titles up to 120 characters
- library and questionnaire forms may be up to 256 KB (other forms 20 KB), so long accented text fits

## Data

Migration `016_library.sql` creates three tables:

- `message_templates`
- `questionnaires`, with the questions as JSONB, re-checked by a normaliser before use, as checklist templates are
- `wedding_questionnaires`, with a copy of the questions, `answers` JSONB, and who answered and when

## Testing

- **Message templates:**
  - CRUD and duplicate names
  - placeholders filled for the active wedding
  - only their owner can use them; another person's id gives 404
- **Questionnaires:**
  - the builder drops empty rows and validates options
  - sending copies the questions
  - the couple answers, and choices are validated
  - the planner sees the answers
  - viewers and askers can't answer, and other weddings get 404
