import { ConditionEvaluator } from '../condition-evaluator';
import { ConditionGroup, FilterRule } from '../../types/workflow-schema';

describe('ConditionEvaluator', () => {
  describe('Basic Operators', () => {
    test('equals operator', () => {
      const condition: ConditionGroup = {
        operator: 'AND',
        rules: [{ field: 'status', operator: 'equals', value: 'open' }],
      };

      expect(ConditionEvaluator.evaluate(condition, { status: 'open' })).toBe(true);
      expect(ConditionEvaluator.evaluate(condition, { status: 'closed' })).toBe(false);
    });

    test('not_equals operator', () => {
      const condition: ConditionGroup = {
        operator: 'AND',
        rules: [{ field: 'status', operator: 'not_equals', value: 'open' }],
      };

      expect(ConditionEvaluator.evaluate(condition, { status: 'closed' })).toBe(true);
      expect(ConditionEvaluator.evaluate(condition, { status: 'open' })).toBe(false);
    });

    test('contains operator with strings', () => {
      const condition: ConditionGroup = {
        operator: 'AND',
        rules: [{ field: 'title', operator: 'contains', value: 'bug' }],
      };

      expect(ConditionEvaluator.evaluate(condition, { title: 'Fix bug in parser' })).toBe(true);
      expect(ConditionEvaluator.evaluate(condition, { title: 'Add new feature' })).toBe(false);
    });

    test('contains operator with arrays', () => {
      const condition: ConditionGroup = {
        operator: 'AND',
        rules: [{ field: 'labels', operator: 'contains', value: 'bug' }],
      };

      expect(ConditionEvaluator.evaluate(condition, { labels: ['bug', 'urgent'] })).toBe(true);
      expect(ConditionEvaluator.evaluate(condition, { labels: ['feature', 'enhancement'] })).toBe(false);
    });

    test('not_contains operator', () => {
      const condition: ConditionGroup = {
        operator: 'AND',
        rules: [{ field: 'title', operator: 'not_contains', value: 'bug' }],
      };

      expect(ConditionEvaluator.evaluate(condition, { title: 'Add new feature' })).toBe(true);
      expect(ConditionEvaluator.evaluate(condition, { title: 'Fix bug in parser' })).toBe(false);
    });

    test('regex operator', () => {
      const condition: ConditionGroup = {
        operator: 'AND',
        rules: [{ field: 'branch', operator: 'regex', value: '^feature/.*' }],
      };

      expect(ConditionEvaluator.evaluate(condition, { branch: 'feature/new-ui' })).toBe(true);
      expect(ConditionEvaluator.evaluate(condition, { branch: 'bugfix/memory-leak' })).toBe(false);
    });

    test('in operator', () => {
      const condition: ConditionGroup = {
        operator: 'AND',
        rules: [{ field: 'status', operator: 'in', value: ['open', 'in_progress'] }],
      };

      expect(ConditionEvaluator.evaluate(condition, { status: 'open' })).toBe(true);
      expect(ConditionEvaluator.evaluate(condition, { status: 'in_progress' })).toBe(true);
      expect(ConditionEvaluator.evaluate(condition, { status: 'closed' })).toBe(false);
    });

    test('not_in operator', () => {
      const condition: ConditionGroup = {
        operator: 'AND',
        rules: [{ field: 'status', operator: 'not_in', value: ['closed', 'rejected'] }],
      };

      expect(ConditionEvaluator.evaluate(condition, { status: 'open' })).toBe(true);
      expect(ConditionEvaluator.evaluate(condition, { status: 'closed' })).toBe(false);
    });

    test('greater_than operator', () => {
      const condition: ConditionGroup = {
        operator: 'AND',
        rules: [{ field: 'priority', operator: 'greater_than', value: 5 }],
      };

      expect(ConditionEvaluator.evaluate(condition, { priority: 10 })).toBe(true);
      expect(ConditionEvaluator.evaluate(condition, { priority: 3 })).toBe(false);
    });

    test('less_than operator', () => {
      const condition: ConditionGroup = {
        operator: 'AND',
        rules: [{ field: 'days_open', operator: 'less_than', value: 7 }],
      };

      expect(ConditionEvaluator.evaluate(condition, { days_open: 3 })).toBe(true);
      expect(ConditionEvaluator.evaluate(condition, { days_open: 10 })).toBe(false);
    });

    test('between operator', () => {
      const condition: ConditionGroup = {
        operator: 'AND',
        rules: [{ field: 'size', operator: 'between', value: [10, 100] }],
      };

      expect(ConditionEvaluator.evaluate(condition, { size: 50 })).toBe(true);
      expect(ConditionEvaluator.evaluate(condition, { size: 10 })).toBe(true);
      expect(ConditionEvaluator.evaluate(condition, { size: 100 })).toBe(true);
      expect(ConditionEvaluator.evaluate(condition, { size: 5 })).toBe(false);
      expect(ConditionEvaluator.evaluate(condition, { size: 150 })).toBe(false);
    });

    test('is_null operator', () => {
      const condition: ConditionGroup = {
        operator: 'AND',
        rules: [{ field: 'assignee', operator: 'is_null', value: null }],
      };

      expect(ConditionEvaluator.evaluate(condition, { assignee: null })).toBe(true);
      expect(ConditionEvaluator.evaluate(condition, { assignee: undefined })).toBe(true);
      expect(ConditionEvaluator.evaluate(condition, {})).toBe(true);
      expect(ConditionEvaluator.evaluate(condition, { assignee: 'john' })).toBe(false);
    });

    test('is_not_null operator', () => {
      const condition: ConditionGroup = {
        operator: 'AND',
        rules: [{ field: 'assignee', operator: 'is_not_null', value: null }],
      };

      expect(ConditionEvaluator.evaluate(condition, { assignee: 'john' })).toBe(true);
      expect(ConditionEvaluator.evaluate(condition, { assignee: '' })).toBe(true);
      expect(ConditionEvaluator.evaluate(condition, { assignee: null })).toBe(false);
      expect(ConditionEvaluator.evaluate(condition, {})).toBe(false);
    });
  });

  describe('Field Access', () => {
    test('simple property access', () => {
      const condition: ConditionGroup = {
        operator: 'AND',
        rules: [{ field: 'name', operator: 'equals', value: 'test' }],
      };

      expect(ConditionEvaluator.evaluate(condition, { name: 'test' })).toBe(true);
    });

    test('nested property access with dot notation', () => {
      const condition: ConditionGroup = {
        operator: 'AND',
        rules: [{ field: 'user.name', operator: 'equals', value: 'john' }],
      };

      expect(ConditionEvaluator.evaluate(condition, { user: { name: 'john' } })).toBe(true);
      expect(ConditionEvaluator.evaluate(condition, { user: { name: 'jane' } })).toBe(false);
    });

    test('deep nested property access', () => {
      const condition: ConditionGroup = {
        operator: 'AND',
        rules: [{ field: 'data.user.profile.age', operator: 'greater_than', value: 18 }],
      };

      const context = {
        data: {
          user: {
            profile: {
              age: 25,
            },
          },
        },
      };

      expect(ConditionEvaluator.evaluate(condition, context)).toBe(true);
    });

    test('array access with bracket notation', () => {
      const condition: ConditionGroup = {
        operator: 'AND',
        rules: [{ field: 'items[0]', operator: 'equals', value: 'first' }],
      };

      expect(ConditionEvaluator.evaluate(condition, { items: ['first', 'second'] })).toBe(true);
    });

    test('nested array access', () => {
      const condition: ConditionGroup = {
        operator: 'AND',
        rules: [{ field: 'data.items[1].name', operator: 'equals', value: 'test' }],
      };

      const context = {
        data: {
          items: [
            { name: 'first' },
            { name: 'test' },
          ],
        },
      };

      expect(ConditionEvaluator.evaluate(condition, context)).toBe(true);
    });

    test('missing property returns undefined', () => {
      const condition: ConditionGroup = {
        operator: 'AND',
        rules: [{ field: 'missing.property', operator: 'is_null', value: null }],
      };

      expect(ConditionEvaluator.evaluate(condition, { other: 'value' })).toBe(true);
    });
  });

  describe('Logical Operators', () => {
    test('AND operator - all conditions must be true', () => {
      const condition: ConditionGroup = {
        operator: 'AND',
        rules: [
          { field: 'status', operator: 'equals', value: 'open' },
          { field: 'priority', operator: 'greater_than', value: 5 },
        ],
      };

      expect(ConditionEvaluator.evaluate(condition, { status: 'open', priority: 10 })).toBe(true);
      expect(ConditionEvaluator.evaluate(condition, { status: 'open', priority: 3 })).toBe(false);
      expect(ConditionEvaluator.evaluate(condition, { status: 'closed', priority: 10 })).toBe(false);
    });

    test('OR operator - at least one condition must be true', () => {
      const condition: ConditionGroup = {
        operator: 'OR',
        rules: [
          { field: 'status', operator: 'equals', value: 'open' },
          { field: 'priority', operator: 'greater_than', value: 8 },
        ],
      };

      expect(ConditionEvaluator.evaluate(condition, { status: 'open', priority: 3 })).toBe(true);
      expect(ConditionEvaluator.evaluate(condition, { status: 'closed', priority: 10 })).toBe(true);
      expect(ConditionEvaluator.evaluate(condition, { status: 'closed', priority: 5 })).toBe(false);
    });

    test('NOT operator - negates all conditions', () => {
      const condition: ConditionGroup = {
        operator: 'NOT',
        rules: [
          { field: 'status', operator: 'equals', value: 'closed' },
          { field: 'resolved', operator: 'equals', value: true },
        ],
      };

      expect(ConditionEvaluator.evaluate(condition, { status: 'open', resolved: false })).toBe(true);
      expect(ConditionEvaluator.evaluate(condition, { status: 'closed', resolved: false })).toBe(false);
      expect(ConditionEvaluator.evaluate(condition, { status: 'open', resolved: true })).toBe(false);
    });
  });

  describe('Nested Conditions', () => {
    test('nested AND within OR', () => {
      const condition: ConditionGroup = {
        operator: 'OR',
        rules: [
          {
            operator: 'AND',
            rules: [
              { field: 'type', operator: 'equals', value: 'bug' },
              { field: 'priority', operator: 'greater_than', value: 7 },
            ],
          },
          { field: 'status', operator: 'equals', value: 'critical' },
        ],
      };

      expect(ConditionEvaluator.evaluate(condition, { type: 'bug', priority: 8, status: 'open' })).toBe(true);
      expect(ConditionEvaluator.evaluate(condition, { type: 'feature', priority: 5, status: 'critical' })).toBe(true);
      expect(ConditionEvaluator.evaluate(condition, { type: 'bug', priority: 5, status: 'open' })).toBe(false);
    });

    test('deeply nested conditions', () => {
      const condition: ConditionGroup = {
        operator: 'AND',
        rules: [
          { field: 'active', operator: 'equals', value: true },
          {
            operator: 'OR',
            rules: [
              {
                operator: 'AND',
                rules: [
                  { field: 'user.role', operator: 'equals', value: 'admin' },
                  { field: 'user.permissions', operator: 'contains', value: 'write' },
                ],
              },
              {
                operator: 'AND',
                rules: [
                  { field: 'user.role', operator: 'equals', value: 'moderator' },
                  { field: 'scope', operator: 'in', value: ['posts', 'comments'] },
                ],
              },
            ],
          },
        ],
      };

      const adminContext = {
        active: true,
        user: { role: 'admin', permissions: ['read', 'write', 'delete'] },
      };
      expect(ConditionEvaluator.evaluate(condition, adminContext)).toBe(true);

      const moderatorContext = {
        active: true,
        user: { role: 'moderator' },
        scope: 'posts',
      };
      expect(ConditionEvaluator.evaluate(condition, moderatorContext)).toBe(true);

      const userContext = {
        active: true,
        user: { role: 'user' },
      };
      expect(ConditionEvaluator.evaluate(condition, userContext)).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    test('empty conditions return true', () => {
      expect(ConditionEvaluator.evaluate({ operator: 'AND', rules: [] }, {})).toBe(true);
    });

    test('handles type coercion for numeric comparisons', () => {
      const condition: ConditionGroup = {
        operator: 'AND',
        rules: [{ field: 'count', operator: 'greater_than', value: 5 }],
      };

      expect(ConditionEvaluator.evaluate(condition, { count: '10' })).toBe(true);
      expect(ConditionEvaluator.evaluate(condition, { count: '3' })).toBe(false);
    });

    test('invalid regex returns false', () => {
      const condition: ConditionGroup = {
        operator: 'AND',
        rules: [{ field: 'text', operator: 'regex', value: '[invalid' }],
      };

      expect(ConditionEvaluator.evaluate(condition, { text: 'test' })).toBe(false);
    });

    test('between operator with invalid array', () => {
      const condition: ConditionGroup = {
        operator: 'AND',
        rules: [{ field: 'value', operator: 'between', value: [10] as any }],
      };

      expect(ConditionEvaluator.evaluate(condition, { value: 15 })).toBe(false);
    });

    test('unknown operator throws error', () => {
      const condition: ConditionGroup = {
        operator: 'AND',
        rules: [{ field: 'value', operator: 'unknown_op' as any, value: 'test' }],
      };

      expect(() => ConditionEvaluator.evaluate(condition, { value: 'test' })).toThrow('Unknown operator: unknown_op');
    });

    test('unknown logical operator throws error', () => {
      const condition: ConditionGroup = {
        operator: 'XOR' as any,
        rules: [{ field: 'value', operator: 'equals', value: 'test' }],
      };

      expect(() => ConditionEvaluator.evaluate(condition, { value: 'test' })).toThrow('Unknown logical operator: XOR');
    });
  });

});