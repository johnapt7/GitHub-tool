import { ConditionGroup, FilterRule } from '../types/workflow-schema';

export interface EvaluationContext {
  [key: string]: any;
}

export class ConditionEvaluator {
  private static readonly OPERATORS = {
    equals: (a: any, b: any) => a === b,
    not_equals: (a: any, b: any) => a !== b,
    contains: (a: any, b: any) => {
      if (typeof a === 'string' && typeof b === 'string') {
        return a.includes(b);
      }
      if (Array.isArray(a)) {
        return a.includes(b);
      }
      return false;
    },
    not_contains: (a: any, b: any) => !ConditionEvaluator.OPERATORS.contains(a, b),
    regex: (a: any, b: string) => {
      if (typeof a !== 'string') return false;
      try {
        const regex = new RegExp(b);
        return regex.test(a);
      } catch {
        return false;
      }
    },
    matches: (a: any, b: string) => {
      // Alias for regex
      return ConditionEvaluator.OPERATORS.regex(a, b);
    },
    starts_with: (a: any, b: any) => {
      if (typeof a === 'string' && typeof b === 'string') {
        return a.startsWith(b);
      }
      return false;
    },
    ends_with: (a: any, b: any) => {
      if (typeof a === 'string' && typeof b === 'string') {
        return a.endsWith(b);
      }
      return false;
    },
    greater_equal: (a: any, b: any) => {
      const numA = Number(a);
      const numB = Number(b);
      if (isNaN(numA) || isNaN(numB)) return false;
      return numA >= numB;
    },
    less_equal: (a: any, b: any) => {
      const numA = Number(a);
      const numB = Number(b);
      if (isNaN(numA) || isNaN(numB)) return false;
      return numA <= numB;
    },
    exists: (a: any) => a !== undefined,
    not_exists: (a: any) => a === undefined,
    in: (a: any, b: any[]) => {
      if (!Array.isArray(b)) return false;
      return b.includes(a);
    },
    not_in: (a: any, b: any[]) => !ConditionEvaluator.OPERATORS.in(a, b),
    greater_than: (a: any, b: any) => {
      const numA = Number(a);
      const numB = Number(b);
      if (isNaN(numA) || isNaN(numB)) return false;
      return numA > numB;
    },
    less_than: (a: any, b: any) => {
      const numA = Number(a);
      const numB = Number(b);
      if (isNaN(numA) || isNaN(numB)) return false;
      return numA < numB;
    },
    between: (a: any, b: [any, any]) => {
      if (!Array.isArray(b) || b.length !== 2) return false;
      const numA = Number(a);
      const numB1 = Number(b[0]);
      const numB2 = Number(b[1]);
      if (isNaN(numA) || isNaN(numB1) || isNaN(numB2)) return false;
      return numA >= numB1 && numA <= numB2;
    },
    is_null: (a: any) => a === null || a === undefined,
    is_not_null: (a: any) => a !== null && a !== undefined,
  };

  /**
   * Evaluates a condition group against the provided context
   */
  static evaluate(conditions: ConditionGroup, context: EvaluationContext): boolean {
    if (!conditions || !conditions.rules || conditions.rules.length === 0) {
      return true;
    }

    const { operator = 'AND', rules } = conditions;
    
    switch (operator) {
      case 'AND':
        return rules.every(rule => this.evaluateRule(rule, context));
      case 'OR':
        return rules.some(rule => this.evaluateRule(rule, context));
      case 'NOT':
        return !rules.some(rule => this.evaluateRule(rule, context));
      default:
        throw new Error(`Unknown logical operator: ${operator}`);
    }
  }

  /**
   * Evaluates a single filter rule or nested condition group
   */
  private static evaluateRule(rule: FilterRule | ConditionGroup, context: EvaluationContext): boolean {
    if ('rules' in rule) {
      return this.evaluate(rule as ConditionGroup, context);
    }

    const filterRule = rule as FilterRule;
    const fieldValue = this.getFieldValue(context, filterRule.field);
    
    const operatorFn = this.OPERATORS[filterRule.operator as keyof typeof this.OPERATORS] as any;
    if (!operatorFn) {
      throw new Error(`Unknown operator: ${filterRule.operator}`);
    }

    if (filterRule.operator === 'is_null' || filterRule.operator === 'is_not_null' || 
        filterRule.operator === 'exists' || filterRule.operator === 'not_exists') {
      return operatorFn(fieldValue);
    }

    return operatorFn(fieldValue, filterRule.value);
  }

  /**
   * Retrieves a value from the context using dot notation or array access
   */
  private static getFieldValue(context: EvaluationContext, field: string): any {
    if (!field) return undefined;

    const parts = this.parseFieldPath(field);
    let current: any = context;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }

      if (part.type === 'property') {
        current = current[part.key];
      } else if (part.type === 'array') {
        if (!Array.isArray(current)) {
          return undefined;
        }
        const index = parseInt(part.key, 10);
        if (isNaN(index)) {
          if (part.key === '*') {
            return current;
          }
          return undefined;
        }
        current = current[index];
      }
    }

    return current;
  }

  /**
   * Parses a field path supporting dot notation and array access
   */
  private static parseFieldPath(field: string): Array<{ type: 'property' | 'array'; key: string }> {
    const parts: Array<{ type: 'property' | 'array'; key: string }> = [];
    let current = '';
    let inBracket = false;

    for (let i = 0; i < field.length; i++) {
      const char = field[i];

      if (char === '[' && !inBracket) {
        if (current) {
          parts.push({ type: 'property', key: current });
          current = '';
        }
        inBracket = true;
      } else if (char === ']' && inBracket) {
        if (current) {
          parts.push({ type: 'array', key: current });
          current = '';
        }
        inBracket = false;
      } else if (char === '.' && !inBracket) {
        if (current) {
          parts.push({ type: 'property', key: current });
          current = '';
        }
      } else {
        current += char;
      }
    }

    if (current) {
      parts.push({ type: 'property', key: current });
    }

    return parts;
  }

}