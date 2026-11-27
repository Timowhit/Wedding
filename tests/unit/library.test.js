import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    fillPlaceholders,
    normaliseQuestions,
    validateAnswers,
    validateQuestionnaire
} from '../../src/validators/library.js';

describe('library helpers', () => {
    it('fills known placeholders and leaves the rest as written', () => {
        assert.equal(
            fillPlaceholders('Hi {couple}, {x} {couple}!', { couple: 'Ana & Luis' }),
            'Hi Ana & Luis, {x} Ana & Luis!'
        );
        assert.equal(
            fillPlaceholders('{constructor} {__proto__}', {}),
            '{constructor} {__proto__}',
            'no inherited keys'
        );
    });

    it('normalises stored questions: skips broken ones, demotes a choice without options', () => {
        assert.deepEqual(
            normaliseQuestions([
                { text: 'Ok?', type: 'long' },
                null,
                { text: '   ' },
                { text: 'Pick', type: 'choice', options: ['A'] },
                { text: 'Odd', type: 'video' }
            ]),
            [
                { text: 'Ok?', type: 'long', options: [] },
                { text: 'Pick', type: 'short', options: [] },
                { text: 'Odd', type: 'short', options: [] }
            ]
        );
        assert.deepEqual(normaliseQuestions('not json'), []);
    });

    it('needs a title and at least one question', () => {
        const fields = validateQuestionnaire({ title: '', q0_text: '', q0_type: 'short' }).errors.map((e) => e.field);
        assert.deepEqual(fields.sort(), ['q0_text', 'title']);
    });

    it('answers: choices must match, empty answers are allowed', () => {
        const questions = [
            { text: 'Name?', type: 'short', options: [] },
            { text: 'Style', type: 'choice', options: ['Civil', 'Religious'] }
        ];
        assert.deepEqual(validateAnswers({ a0: '', a1: 'Civil' }, questions).errors, []);
        assert.deepEqual(
            validateAnswers({ a0: 'x', a1: 'Pirate' }, questions).errors.map((e) => e.field),
            ['a1']
        );
    });

    it('trims and de-duplicates choice options, so every stored option can be chosen', () => {
        assert.deepEqual(normaliseQuestions([{ text: 'Pick', type: 'choice', options: [' y ', 'y', 'n'] }]), [
            { text: 'Pick', type: 'choice', options: ['y', 'n'] }
        ]);
        const built = validateQuestionnaire({ title: 'T', q0_text: 'Pick', q0_type: 'choice', q0_options: 'a\na\nb' });
        assert.deepEqual(built.data.questions[0].options, ['a', 'b']);
    });

    it('rows past the builder limit are reported, not silently dropped', () => {
        const result = validateQuestionnaire({
            title: 'T',
            q0_text: 'One',
            q0_type: 'short',
            q45_text: 'Lost?',
            q45_type: 'short'
        });
        assert.ok(result.errors.some((e) => e.key === 'library.tooManyQuestions'));
    });
});
