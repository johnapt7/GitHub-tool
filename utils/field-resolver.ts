/**
 * Safe field resolver for extracting values from nested GitHub webhook payloads
 * Supports dot notation, array operations, and graceful error handling
 */

export interface FieldResolverOptions {
  /**
   * Return undefined for missing fields instead of throwing errors
   * @default true
   */
  graceful?: boolean;
  
  /**
   * Default value to return when field is missing (only used when graceful=true)
   * @default undefined
   */
  defaultValue?: any;
  
  /**
   * Maximum depth to traverse to prevent infinite loops
   * @default 50
   */
  maxDepth?: number;
  
  /**
   * Whether to treat null values as missing fields
   * @default false
   */
  treatNullAsMissing?: boolean;
}

export type FieldPath = string | string[];

export interface PathSegment {
  type: 'property' | 'array_index' | 'array_all' | 'array_filter';
  key: string;
  filter?: string; // For array filtering like [name="value"]
}

/**
 * Field resolver for safe extraction of values from nested objects
 * Particularly designed for GitHub webhook payloads
 */
export class FieldResolver {
  private readonly options: Required<FieldResolverOptions>;

  constructor(options: FieldResolverOptions = {}) {
    this.options = {
      graceful: true,
      defaultValue: undefined,
      maxDepth: 50,
      treatNullAsMissing: false,
      ...options
    };
  }

  /**
   * Extract value from object using dot notation path
   * Examples:
   * - 'issue.title'
   * - 'pull_request.labels[0].name'
   * - 'commits[*].author.email'
   * - 'labels[*].name'
   * - 'reviews[state="approved"].user.login'
   */
  public resolve(data: any, path: FieldPath): any {
    if (!this.isValidInput(data, path)) {
      return this.handleMissing('Invalid input data or path');
    }

    try {
      const segments = this.parsePath(path);
      return this.traversePath(data, segments, 0);
    } catch (error) {
      return this.handleMissing(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Extract multiple values using multiple paths
   * Returns object with path as key and resolved value as value
   */
  public resolveMultiple(data: any, paths: Record<string, FieldPath>): Record<string, any> {
    const results: Record<string, any> = {};
    
    for (const [key, path] of Object.entries(paths)) {
      results[key] = this.resolve(data, path);
    }
    
    return results;
  }

  /**
   * Check if a field exists at the given path
   */
  public exists(data: any, path: FieldPath): boolean {
    if (!this.isValidInput(data, path)) {
      return false;
    }

    try {
      const segments = this.parsePath(path);
      const result = this.traversePath(data, segments, 0);
      return !this.isMissingValue(result);
    } catch {
      return false;
    }
  }

  /**
   * Get all available field paths from an object (useful for debugging)
   * Returns array of dot-notation paths
   */
  public getAvailablePaths(data: any, maxDepth: number = 3): string[] {
    const paths: string[] = [];
    this.collectPaths(data, '', paths, 0, maxDepth);
    return paths.sort();
  }

  /**
   * Parse field path into segments
   */
  private parsePath(path: FieldPath): PathSegment[] {
    const pathString = Array.isArray(path) ? path.join('.') : path;
    const segments: PathSegment[] = [];
    
    let current = '';
    let inBracket = false;
    let bracketContent = '';
    
    for (let i = 0; i < pathString.length; i++) {
      const char = pathString[i];
      
      if (char === '[' && !inBracket) {
        // Start of bracket notation
        if (current) {
          segments.push({ type: 'property', key: current });
          current = '';
        }
        inBracket = true;
        bracketContent = '';
      } else if (char === ']' && inBracket) {
        // End of bracket notation
        segments.push(this.parseBracketContent(bracketContent));
        inBracket = false;
        bracketContent = '';
      } else if (char === '.' && !inBracket) {
        // Property separator
        if (current) {
          segments.push({ type: 'property', key: current });
          current = '';
        }
      } else if (inBracket) {
        bracketContent += char;
      } else {
        current += char;
      }
    }
    
    // Add final segment if exists
    if (current) {
      segments.push({ type: 'property', key: current });
    }
    
    return segments;
  }

  /**
   * Parse bracket content to determine array operation type
   */
  private parseBracketContent(content: string): PathSegment {
    const trimmed = content.trim();
    
    // Array all operation: [*]
    if (trimmed === '*') {
      return { type: 'array_all', key: '*' };
    }
    
    // Array index: [0], [1], [-1], etc.
    if (/^-?\d+$/.test(trimmed)) {
      return { type: 'array_index', key: trimmed };
    }
    
    // Array filter: [name="value"], [state="approved"], etc.
    const filterMatch = trimmed.match(/^(\w+)\s*=\s*["']([^"']+)["']$/);
    if (filterMatch) {
      const [, filterKey, filterValue] = filterMatch;
      if (filterKey && filterValue !== undefined) {
        return { 
          type: 'array_filter', 
          key: filterKey,
          filter: filterValue 
        };
      }
    }
    
    // Fallback to treating as property name
    return { type: 'property', key: trimmed };
  }

  /**
   * Traverse the object following the parsed path segments
   */
  private traversePath(current: any, segments: PathSegment[], depth: number): any {
    if (depth > this.options.maxDepth) {
      throw new Error(`Maximum traversal depth (${this.options.maxDepth}) exceeded`);
    }
    
    if (segments.length === 0) {
      return current;
    }
    
    if (this.isMissingValue(current)) {
      return this.handleMissing('Encountered null/undefined in path traversal');
    }
    
    const [segment, ...remainingSegments] = segments;
    
    if (!segment) {
      return this.handleMissing('Empty segment in path');
    }
    
    switch (segment.type) {
      case 'property':
        const propertyValue = current[segment.key];
        // If this is the final segment and value should be treated as missing
        if (remainingSegments.length === 0 && this.isMissingValue(propertyValue)) {
          return this.handleMissing(`Property '${segment.key}' is missing or null`);
        }
        return this.traversePath(
          propertyValue, 
          remainingSegments, 
          depth + 1
        );
        
      case 'array_index':
        return this.handleArrayIndex(current, segment, remainingSegments, depth);
        
      case 'array_all':
        return this.handleArrayAll(current, remainingSegments, depth);
        
      case 'array_filter':
        return this.handleArrayFilter(current, segment, remainingSegments, depth);
        
      default:
        throw new Error(`Unknown segment type: ${(segment as any).type}`);
    }
  }

  /**
   * Handle array index access like [0], [1]
   */
  private handleArrayIndex(
    current: any, 
    segment: PathSegment, 
    remainingSegments: PathSegment[], 
    depth: number
  ): any {
    if (!Array.isArray(current)) {
      return this.handleMissing('Attempted array index access on non-array');
    }
    
    const index = parseInt(segment.key, 10);
    if (isNaN(index)) {
      return this.handleMissing(`Invalid array index: ${segment.key}`);
    }
    
    // Handle negative indices
    const actualIndex = index < 0 ? current.length + index : index;
    
    if (actualIndex < 0 || actualIndex >= current.length) {
      return this.handleMissing(`Array index ${index} out of bounds`);
    }
    
    return this.traversePath(current[actualIndex], remainingSegments, depth + 1);
  }

  /**
   * Handle array all operation [*] - returns array of results
   */
  private handleArrayAll(
    current: any, 
    remainingSegments: PathSegment[], 
    depth: number
  ): any {
    if (!Array.isArray(current)) {
      return this.handleMissing('Attempted array all operation on non-array');
    }
    
    // If no more segments, return the entire array
    if (remainingSegments.length === 0) {
      return current;
    }
    
    // Apply remaining path to each array element
    const results: any[] = [];
    for (const item of current) {
      try {
        const result = this.traversePath(item, remainingSegments, depth + 1);
        if (!this.isMissingValue(result)) {
          results.push(result);
        }
      } catch (error) {
        // Skip items that cause errors in graceful mode
        if (!this.options.graceful) {
          throw new Error(`Array traversal failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }
    
    return results;
  }

  /**
   * Handle array filtering like [name="value"]
   */
  private handleArrayFilter(
    current: any, 
    segment: PathSegment, 
    remainingSegments: PathSegment[], 
    depth: number
  ): any {
    if (!Array.isArray(current)) {
      return this.handleMissing('Attempted array filter on non-array');
    }
    
    const filtered = current.filter(item => {
      if (typeof item !== 'object' || item === null) {
        return false;
      }
      return item[segment.key] === segment.filter;
    });
    
    // If no remaining segments, return filtered array
    if (remainingSegments.length === 0) {
      return filtered;
    }
    
    // If next segment is an array operation, return filtered array and let normal traversal continue
    const nextSegment = remainingSegments[0];
    if (nextSegment && (nextSegment.type === 'array_all' || nextSegment.type === 'array_index' || nextSegment.type === 'array_filter')) {
      return this.traversePath(filtered, remainingSegments, depth);
    }
    
    // Apply remaining path to each filtered item
    const results: any[] = [];
    for (const item of filtered) {
      try {
        const result = this.traversePath(item, remainingSegments, depth + 1);
        if (!this.isMissingValue(result)) {
          results.push(result);
        }
      } catch (error) {
        if (!this.options.graceful) {
          throw new Error(`Array traversal failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }
    
    return results;
  }

  /**
   * Check if input data and path are valid
   */
  private isValidInput(data: any, path: FieldPath): boolean {
    if (data === null || data === undefined) {
      return false;
    }
    
    if (!path || (Array.isArray(path) && path.length === 0) || 
        (typeof path === 'string' && path.trim() === '')) {
      return false;
    }
    
    return true;
  }

  /**
   * Check if a value should be considered missing
   */
  private isMissingValue(value: any): boolean {
    if (value === undefined) {
      return true;
    }
    
    if (this.options.treatNullAsMissing && value === null) {
      return true;
    }
    
    return false;
  }

  /**
   * Handle missing field according to options
   */
  private handleMissing(reason: string): any {
    if (this.options.graceful) {
      return this.options.defaultValue;
    }
    
    throw new Error(`Field resolution failed: ${reason}`);
  }

  /**
   * Recursively collect all available paths in an object
   */
  private collectPaths(
    obj: any, 
    currentPath: string, 
    paths: string[], 
    depth: number, 
    maxDepth: number
  ): void {
    if (depth >= maxDepth || obj === null || obj === undefined) {
      return;
    }
    
    if (typeof obj === 'object') {
      if (Array.isArray(obj)) {
        // For arrays, show both indexed and [*] notation
        if (obj.length > 0) {
          const indexPath = currentPath ? `${currentPath}[0]` : '[0]';
          const allPath = currentPath ? `${currentPath}[*]` : '[*]';
          paths.push(indexPath, allPath);
          
          // Recurse into first array element as example
          this.collectPaths(
            obj[0], 
            indexPath, 
            paths, 
            depth + 1, 
            maxDepth
          );
        }
      } else {
        // For objects, recurse into each property
        for (const [key, value] of Object.entries(obj)) {
          const newPath = currentPath ? `${currentPath}.${key}` : key;
          paths.push(newPath);
          
          this.collectPaths(value, newPath, paths, depth + 1, maxDepth);
        }
      }
    }
  }
}

/**
 * Convenience function to create a field resolver and resolve a single path
 */
export function resolveField(
  data: any, 
  path: FieldPath, 
  options?: FieldResolverOptions
): any {
  const resolver = new FieldResolver(options);
  return resolver.resolve(data, path);
}

/**
 * Convenience function for multiple field resolution
 */
export function resolveFields(
  data: any, 
  paths: Record<string, FieldPath>, 
  options?: FieldResolverOptions
): Record<string, any> {
  const resolver = new FieldResolver(options);
  return resolver.resolveMultiple(data, paths);
}