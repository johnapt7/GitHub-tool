import { ExecutionContext } from '../types/workflow-schema';
import logger from '../utils/logger';
import { FieldResolver } from '../utils/field-resolver';

export interface TemplateVariable {
  name: string;
  value: any;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  source: 'context' | 'secrets' | 'variables' | 'computed';
}

export interface TemplateResolutionOptions {
  strictMode?: boolean; // Throw error on undefined variables
  defaultValue?: any; // Default value for undefined variables
  maxDepth?: number; // Maximum nesting depth to prevent infinite loops
  enableHelpers?: boolean; // Enable template helper functions
}

export class TemplateEngine {
  private readonly templateRegex = /\{\{([^}]+)\}\}/g;
  private readonly helperFunctions: Map<string, Function> = new Map();
  private readonly fieldResolver: FieldResolver;

  constructor() {
    this.fieldResolver = new FieldResolver({
      graceful: true,
      defaultValue: undefined
    });
    this.registerDefaultHelpers();
  }

  /**
   * Resolve template variables in any object structure
   */
  public async resolveTemplate(
    template: any,
    context: ExecutionContext,
    options: TemplateResolutionOptions = {}
  ): Promise<any> {
    const opts = {
      strictMode: false,
      maxDepth: 10,
      enableHelpers: true,
      ...options
    };

    try {
      const result = await this.resolveValue(template, context, opts, 0);
      
      logger.debug(`Template resolution completed`, {
        executionId: context.execution.id,
        hasTemplate: this.hasTemplateVariables(template),
        strictMode: opts.strictMode
      });

      return result;

    } catch (error) {
      logger.error(`Template resolution failed`, {
        executionId: context.execution.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        template: typeof template === 'string' ? template : '[object]'
      });
      throw error;
    }
  }

  /**
   * Extract all template variables from a template
   */
  public extractVariables(template: any): TemplateVariable[] {
    const variables: TemplateVariable[] = [];
    this.extractVariablesRecursive(template, variables);
    return variables;
  }

  /**
   * Check if a value contains template variables
   */
  public hasTemplateVariables(value: any): boolean {
    if (typeof value === 'string') {
      return this.templateRegex.test(value);
    }

    if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        return value.some(item => this.hasTemplateVariables(item));
      }
      
      return Object.values(value).some(val => this.hasTemplateVariables(val));
    }

    return false;
  }

  /**
   * Get available variables from context
   */
  public getAvailableVariables(context: ExecutionContext): Record<string, any> {
    return {
      workflow: context.workflow,
      trigger: context.trigger,
      repository: context.repository,
      execution: context.execution,
      variables: context.variables,
      // Note: secrets are not included for security
      ...this.getComputedVariables(context)
    };
  }

  /**
   * Validate template syntax
   */
  public validateTemplate(template: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    let match;

    // Reset regex state
    this.templateRegex.lastIndex = 0;

    try {
      while ((match = this.templateRegex.exec(template)) !== null) {
        const expression = match[1].trim();
        
        // Check for valid expression syntax
        if (!this.isValidExpression(expression)) {
          errors.push(`Invalid expression: ${expression}`);
        }

        // Check for potential security issues
        if (this.containsPotentiallyDangerous(expression)) {
          errors.push(`Potentially dangerous expression: ${expression}`);
        }
      }
    } catch (error) {
      errors.push(`Template parsing error: ${error}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Register a custom helper function
   */
  public registerHelper(name: string, fn: Function): void {
    this.helperFunctions.set(name, fn);
    logger.debug(`Registered template helper: ${name}`);
  }

  /**
   * Recursively resolve template values
   */
  private async resolveValue(
    value: any,
    context: ExecutionContext,
    options: TemplateResolutionOptions,
    depth: number
  ): Promise<any> {
    if (depth > options.maxDepth!) {
      throw new Error(`Maximum template depth (${options.maxDepth}) exceeded`);
    }

    if (typeof value === 'string') {
      return this.resolveStringTemplate(value, context, options);
    }

    if (Array.isArray(value)) {
      return Promise.all(
        value.map(item => this.resolveValue(item, context, options, depth + 1))
      );
    }

    if (typeof value === 'object' && value !== null) {
      const resolved: any = {};
      
      for (const [key, val] of Object.entries(value)) {
        const resolvedKey = await this.resolveValue(key, context, options, depth + 1);
        resolved[resolvedKey] = await this.resolveValue(val, context, options, depth + 1);
      }
      
      return resolved;
    }

    return value;
  }

  /**
   * Resolve template variables in a string
   */
  private resolveStringTemplate(
    template: string,
    context: ExecutionContext,
    options: TemplateResolutionOptions
  ): string {
    // Reset regex state
    this.templateRegex.lastIndex = 0;

    return template.replace(this.templateRegex, (match, expression) => {
      try {
        const trimmedExpression = expression.trim();
        const value = this.evaluateExpression(trimmedExpression, context, options);
        
        return this.formatValue(value);
      } catch (error) {
        if (options.strictMode) {
          throw new Error(`Template variable resolution failed: ${expression} - ${error}`);
        }
        
        logger.warn(`Template variable not resolved`, {
          expression,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        
        return options.defaultValue !== undefined ? String(options.defaultValue) : match;
      }
    });
  }

  /**
   * Evaluate a template expression
   */
  private evaluateExpression(
    expression: string,
    context: ExecutionContext,
    options: TemplateResolutionOptions
  ): any {
    // Handle helper functions
    if (options.enableHelpers && expression.includes('(')) {
      const helperResult = this.evaluateHelper(expression, context);
      if (helperResult !== undefined) {
        return helperResult;
      }
    }

    // Handle direct property access using enhanced field resolver
    return this.fieldResolver.resolve(this.getAvailableVariables(context), expression);
  }

  /**
   * Evaluate helper function
   */
  private evaluateHelper(expression: string, context: ExecutionContext): any {
    const helperMatch = expression.match(/(\w+)\s*\((.*)\)/);
    if (!helperMatch) {
      return undefined;
    }

    const [, helperName, argsString] = helperMatch;
    const helper = this.helperFunctions.get(helperName);
    
    if (!helper) {
      throw new Error(`Unknown helper function: ${helperName}`);
    }

    // Parse arguments (simplified - in production would need proper parser)
    const args = this.parseHelperArguments(argsString, context);
    
    return helper(...args);
  }

  /**
   * Parse helper function arguments
   */
  private parseHelperArguments(argsString: string, context: ExecutionContext): any[] {
    if (!argsString.trim()) {
      return [];
    }

    // Simple argument parsing (would need more sophisticated parsing for production)
    const args = argsString.split(',').map(arg => {
      const trimmed = arg.trim();
      
      // String literal
      if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || 
          (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1);
      }
      
      // Number literal
      if (/^\d+(\.\d+)?$/.test(trimmed)) {
        return parseFloat(trimmed);
      }
      
      // Boolean literal
      if (trimmed === 'true') return true;
      if (trimmed === 'false') return false;
      if (trimmed === 'null') return null;
      
      // Variable reference using enhanced field resolver
      return this.fieldResolver.resolve(this.getAvailableVariables(context), trimmed);
    });

    return args;
  }


  /**
   * Format value for string substitution
   */
  private formatValue(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }
    
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    
    return String(value);
  }

  /**
   * Get computed variables (derived from context)
   */
  private getComputedVariables(context: ExecutionContext): Record<string, any> {
    const now = new Date();
    
    return {
      now: {
        iso: now.toISOString(),
        timestamp: now.getTime(),
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        day: now.getDate(),
        hour: now.getHours(),
        minute: now.getMinutes(),
        second: now.getSeconds()
      },
      execution: {
        ...context.execution,
        duration: context.execution.startTime 
          ? Date.now() - new Date(context.execution.startTime).getTime()
          : 0
      }
    };
  }

  /**
   * Extract variables recursively
   */
  private extractVariablesRecursive(value: any, variables: TemplateVariable[]): void {
    if (typeof value === 'string') {
      // Reset regex state
      this.templateRegex.lastIndex = 0;
      
      let match;
      while ((match = this.templateRegex.exec(value)) !== null) {
        const expression = match[1].trim();
        if (!variables.some(v => v.name === expression)) {
          variables.push({
            name: expression,
            value: undefined,
            type: 'string', // Default type
            source: 'context'
          });
        }
      }
    } else if (Array.isArray(value)) {
      value.forEach(item => this.extractVariablesRecursive(item, variables));
    } else if (typeof value === 'object' && value !== null) {
      Object.values(value).forEach(val => this.extractVariablesRecursive(val, variables));
    }
  }

  /**
   * Check if expression is valid
   */
  private isValidExpression(expression: string): boolean {
    // Basic validation - no dangerous characters
    const dangerousPatterns = [
      /__proto__/,
      /constructor/,
      /prototype/,
      /function\s*\(/,
      /eval\s*\(/,
      /new\s+/,
      /import\s+/,
      /require\s*\(/
    ];

    return !dangerousPatterns.some(pattern => pattern.test(expression));
  }

  /**
   * Check for potentially dangerous expressions
   */
  private containsPotentiallyDangerous(expression: string): boolean {
    const dangerousPatterns = [
      /process\./,
      /global\./,
      /window\./,
      /document\./,
      /console\./,
      /setTimeout/,
      /setInterval/
    ];

    return dangerousPatterns.some(pattern => pattern.test(expression));
  }

  /**
   * Register default helper functions
   */
  private registerDefaultHelpers(): void {
    // String helpers
    this.registerHelper('upper', (str: string) => String(str).toUpperCase());
    this.registerHelper('lower', (str: string) => String(str).toLowerCase());
    this.registerHelper('trim', (str: string) => String(str).trim());
    this.registerHelper('length', (str: string | any[]) => str?.length || 0);
    
    // Date helpers
    this.registerHelper('formatDate', (date: string | Date, format?: string) => {
      const d = new Date(date);
      if (format === 'iso') return d.toISOString();
      if (format === 'date') return d.toDateString();
      if (format === 'time') return d.toTimeString();
      return d.toString();
    });
    
    this.registerHelper('addDays', (date: string | Date, days: number) => {
      const d = new Date(date);
      d.setDate(d.getDate() + days);
      return d.toISOString();
    });
    
    // Number helpers
    this.registerHelper('add', (a: number, b: number) => Number(a) + Number(b));
    this.registerHelper('subtract', (a: number, b: number) => Number(a) - Number(b));
    this.registerHelper('multiply', (a: number, b: number) => Number(a) * Number(b));
    this.registerHelper('divide', (a: number, b: number) => Number(a) / Number(b));
    this.registerHelper('round', (num: number, decimals: number = 0) => {
      const factor = Math.pow(10, decimals);
      return Math.round(Number(num) * factor) / factor;
    });
    
    // Array helpers
    this.registerHelper('join', (array: any[], separator: string = ',') => {
      if (!Array.isArray(array)) return '';
      return array.join(separator);
    });
    
    this.registerHelper('first', (array: any[]) => {
      if (!Array.isArray(array) || array.length === 0) return null;
      return array[0];
    });
    
    this.registerHelper('last', (array: any[]) => {
      if (!Array.isArray(array) || array.length === 0) return null;
      return array[array.length - 1];
    });
    
    this.registerHelper('slice', (array: any[], start: number, end?: number) => {
      if (!Array.isArray(array)) return [];
      return array.slice(start, end);
    });
    
    // Object helpers
    this.registerHelper('keys', (obj: object) => {
      if (typeof obj !== 'object' || obj === null) return [];
      return Object.keys(obj);
    });
    
    this.registerHelper('values', (obj: object) => {
      if (typeof obj !== 'object' || obj === null) return [];
      return Object.values(obj);
    });
    
    // Conditional helpers
    this.registerHelper('if', (condition: any, trueValue: any, falseValue: any = '') => {
      return condition ? trueValue : falseValue;
    });
    
    this.registerHelper('default', (value: any, defaultValue: any) => {
      return value !== null && value !== undefined && value !== '' ? value : defaultValue;
    });
    
    // URL helpers
    this.registerHelper('urlEncode', (str: string) => encodeURIComponent(String(str)));
    this.registerHelper('urlDecode', (str: string) => decodeURIComponent(String(str)));
    
    // JSON helpers
    this.registerHelper('toJson', (obj: any) => JSON.stringify(obj));
    this.registerHelper('fromJson', (str: string) => {
      try {
        return JSON.parse(str);
      } catch {
        return null;
      }
    });

    logger.debug(`Registered ${this.helperFunctions.size} default template helpers`);
  }
}