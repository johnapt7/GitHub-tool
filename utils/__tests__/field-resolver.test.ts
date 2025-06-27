/**
 * Tests for FieldResolver - Safe field extraction from GitHub webhook payloads
 */

import { FieldResolver, resolveField, resolveFields } from '../field-resolver';

describe('FieldResolver', () => {
  let resolver: FieldResolver;
  
  // Sample GitHub webhook payload structure
  const samplePayload = {
    repository: {
      name: 'test-repo',
      full_name: 'owner/test-repo',
      owner: {
        login: 'testowner',
        type: 'User'
      }
    },
    pull_request: {
      number: 123,
      title: 'Add new feature',
      user: {
        login: 'contributor',
        id: 456
      },
      labels: [
        { name: 'enhancement', color: 'green' },
        { name: 'priority-high', color: 'red' },
        { name: 'review-needed', color: 'yellow' }
      ],
      head: {
        ref: 'feature-branch',
        repo: {
          name: 'test-repo',
          owner: { login: 'contributor' }
        }
      }
    },
    commits: [
      {
        id: 'abc123',
        message: 'Initial commit',
        author: { email: 'dev1@example.com', name: 'Dev One' }
      },
      {
        id: 'def456',
        message: 'Add tests',
        author: { email: 'dev2@example.com', name: 'Dev Two' }
      }
    ],
    issue: {
      number: 789,
      title: 'Bug report',
      labels: [
        { name: 'bug', color: 'red' },
        { name: 'confirmed', color: 'orange' }
      ],
      assignees: [
        { login: 'maintainer1', id: 111 },
        { login: 'maintainer2', id: 222 }
      ]
    },
    reviews: [
      { state: 'approved', user: { login: 'reviewer1' } },
      { state: 'changes_requested', user: { login: 'reviewer2' } },
      { state: 'approved', user: { login: 'reviewer3' } }
    ],
    nested: {
      deep: {
        array: [
          { value: 'first', metadata: { priority: 1 } },
          { value: 'second', metadata: { priority: 2 } }
        ]
      }
    }
  };

  beforeEach(() => {
    resolver = new FieldResolver();
  });

  describe('Basic property access', () => {
    it('should resolve simple property paths', () => {
      expect(resolver.resolve(samplePayload, 'repository.name')).toBe('test-repo');
      expect(resolver.resolve(samplePayload, 'pull_request.number')).toBe(123);
      expect(resolver.resolve(samplePayload, 'issue.title')).toBe('Bug report');
    });

    it('should resolve nested property paths', () => {
      expect(resolver.resolve(samplePayload, 'repository.owner.login')).toBe('testowner');
      expect(resolver.resolve(samplePayload, 'pull_request.user.login')).toBe('contributor');
      expect(resolver.resolve(samplePayload, 'pull_request.head.repo.owner.login')).toBe('contributor');
    });

    it('should handle missing properties gracefully', () => {
      expect(resolver.resolve(samplePayload, 'nonexistent.property')).toBeUndefined();
      expect(resolver.resolve(samplePayload, 'repository.missing.field')).toBeUndefined();
    });
  });

  describe('Array index access', () => {
    it('should resolve array index paths', () => {
      expect(resolver.resolve(samplePayload, 'commits[0].id')).toBe('abc123');
      expect(resolver.resolve(samplePayload, 'commits[1].message')).toBe('Add tests');
      expect(resolver.resolve(samplePayload, 'pull_request.labels[0].name')).toBe('enhancement');
    });

    it('should handle negative array indices', () => {
      expect(resolver.resolve(samplePayload, 'commits[-1].id')).toBe('def456');
      expect(resolver.resolve(samplePayload, 'pull_request.labels[-1].name')).toBe('review-needed');
    });

    it('should handle out-of-bounds array access gracefully', () => {
      expect(resolver.resolve(samplePayload, 'commits[10].id')).toBeUndefined();
      expect(resolver.resolve(samplePayload, 'commits[-10].id')).toBeUndefined();
    });

    it('should handle array access on non-arrays gracefully', () => {
      expect(resolver.resolve(samplePayload, 'repository.name[0]')).toBeUndefined();
    });
  });

  describe('Array all operation [*]', () => {
    it('should extract all values from arrays', () => {
      const labelNames = resolver.resolve(samplePayload, 'pull_request.labels[*].name');
      expect(labelNames).toEqual(['enhancement', 'priority-high', 'review-needed']);

      const commitIds = resolver.resolve(samplePayload, 'commits[*].id');
      expect(commitIds).toEqual(['abc123', 'def456']);
    });

    it('should handle nested array operations', () => {
      const authorEmails = resolver.resolve(samplePayload, 'commits[*].author.email');
      expect(authorEmails).toEqual(['dev1@example.com', 'dev2@example.com']);

      const deepValues = resolver.resolve(samplePayload, 'nested.deep.array[*].value');
      expect(deepValues).toEqual(['first', 'second']);
    });

    it('should return entire array when [*] is terminal', () => {
      const labels = resolver.resolve(samplePayload, 'pull_request.labels[*]');
      expect(labels).toEqual(samplePayload.pull_request.labels);
    });

    it('should handle [*] on non-arrays gracefully', () => {
      expect(resolver.resolve(samplePayload, 'repository.name[*]')).toBeUndefined();
    });

    it('should skip missing values in array operations', () => {
      const payloadWithMissing = {
        items: [
          { name: 'item1', value: 'val1' },
          { name: 'item2' }, // missing value
          { name: 'item3', value: 'val3' }
        ]
      };

      const values = resolver.resolve(payloadWithMissing, 'items[*].value');
      expect(values).toEqual(['val1', 'val3']);
    });
  });

  describe('Array filtering [key="value"]', () => {
    it('should filter arrays by property values', () => {
      const approvedReviews = resolver.resolve(samplePayload, 'reviews[state="approved"]');
      expect(approvedReviews).toHaveLength(2);
      expect(approvedReviews[0].user.login).toBe('reviewer1');
      expect(approvedReviews[1].user.login).toBe('reviewer3');
    });

    it('should combine filtering with property access', () => {
      const approvedReviewers = resolver.resolve(samplePayload, 'reviews[state="approved"][*].user.login');
      expect(approvedReviewers).toEqual(['reviewer1', 'reviewer3']);
    });

    it('should handle non-matching filters', () => {
      const notFound = resolver.resolve(samplePayload, 'reviews[state="rejected"]');
      expect(notFound).toEqual([]);
    });

    it('should handle filtering on non-arrays gracefully', () => {
      expect(resolver.resolve(samplePayload, 'repository[name="test"]')).toBeUndefined();
    });
  });

  describe('Complex path combinations', () => {
    it('should handle deeply nested array operations', () => {
      const priorities = resolver.resolve(samplePayload, 'nested.deep.array[*].metadata.priority');
      expect(priorities).toEqual([1, 2]);
    });

    it('should handle mixed property and array access', () => {
      const firstCommitAuthor = resolver.resolve(samplePayload, 'commits[0].author.name');
      expect(firstCommitAuthor).toBe('Dev One');
    });
  });

  describe('Options handling', () => {
    it('should respect graceful mode', () => {
      const gracefulResolver = new FieldResolver({ graceful: true });
      expect(gracefulResolver.resolve(samplePayload, 'missing.field')).toBeUndefined();

      const strictResolver = new FieldResolver({ graceful: false });
      expect(() => strictResolver.resolve(samplePayload, 'missing.field'))
        .toThrow('Field resolution failed');
    });

    it('should use default values', () => {
      const resolverWithDefault = new FieldResolver({ 
        graceful: true, 
        defaultValue: 'DEFAULT' 
      });
      
      expect(resolverWithDefault.resolve(samplePayload, 'missing.field')).toBe('DEFAULT');
    });

    it('should respect treatNullAsMissing option', () => {
      const payloadWithNull = { field: null, nested: { value: null } };
      
      const defaultResolver = new FieldResolver();
      expect(defaultResolver.resolve(payloadWithNull, 'field')).toBe(null);
      
      const nullSensitiveResolver = new FieldResolver({ treatNullAsMissing: true });
      expect(nullSensitiveResolver.resolve(payloadWithNull, 'field')).toBeUndefined();
    });

    it('should respect maxDepth option', () => {
      const shallowResolver = new FieldResolver({ maxDepth: 2, graceful: false });
      expect(() => shallowResolver.resolve(samplePayload, 'repository.owner.login'))
        .toThrow('Maximum traversal depth');
    });
  });

  describe('Utility methods', () => {
    it('should check field existence', () => {
      expect(resolver.exists(samplePayload, 'repository.name')).toBe(true);
      expect(resolver.exists(samplePayload, 'missing.field')).toBe(false);
      expect(resolver.exists(samplePayload, 'commits[0].id')).toBe(true);
      expect(resolver.exists(samplePayload, 'commits[10].id')).toBe(false);
    });

    it('should resolve multiple fields', () => {
      const result = resolver.resolveMultiple(samplePayload, {
        repoName: 'repository.name',
        prNumber: 'pull_request.number',
        labelNames: 'pull_request.labels[*].name',
        firstCommit: 'commits[0].message'
      });

      expect(result).toEqual({
        repoName: 'test-repo',
        prNumber: 123,
        labelNames: ['enhancement', 'priority-high', 'review-needed'],
        firstCommit: 'Initial commit'
      });
    });

    it('should get available paths', () => {
      const simplePaths = resolver.getAvailablePaths({ 
        a: 1, 
        b: { c: 2 }, 
        d: [{ e: 3 }] 
      });
      
      expect(simplePaths).toContain('a');
      expect(simplePaths).toContain('b');
      expect(simplePaths).toContain('b.c');
      expect(simplePaths).toContain('d');
      expect(simplePaths).toContain('d[0]');
      expect(simplePaths).toContain('d[*]');
    });
  });

  describe('Edge cases', () => {
    it('should handle null/undefined input gracefully', () => {
      expect(resolver.resolve(null, 'field')).toBeUndefined();
      expect(resolver.resolve(undefined, 'field')).toBeUndefined();
    });

    it('should handle empty paths', () => {
      expect(resolver.resolve(samplePayload, '')).toBeUndefined();
      expect(resolver.resolve(samplePayload, [])).toBeUndefined();
    });

    it('should handle primitive values', () => {
      expect(resolver.resolve('string', 'length')).toBe(6);
      expect(resolver.resolve(123, 'toString')).toBeDefined();
    });

    it('should handle array paths input', () => {
      expect(resolver.resolve(samplePayload, ['repository', 'name'])).toBe('test-repo');
      expect(resolver.resolve(samplePayload, ['commits', '0', 'id'])).toBe('abc123');
    });
  });

  describe('Convenience functions', () => {
    it('should work with resolveField function', () => {
      expect(resolveField(samplePayload, 'repository.name')).toBe('test-repo');
      expect(resolveField(samplePayload, 'commits[*].id')).toEqual(['abc123', 'def456']);
    });

    it('should work with resolveFields function', () => {
      const result = resolveFields(samplePayload, {
        repo: 'repository.name',
        labels: 'pull_request.labels[*].name'
      });

      expect(result['repo']).toBe('test-repo');
      expect(result['labels']).toEqual(['enhancement', 'priority-high', 'review-needed']);
    });

    it('should pass options to convenience functions', () => {
      const result = resolveField(
        samplePayload, 
        'missing.field', 
        { defaultValue: 'NOT_FOUND' }
      );
      expect(result).toBe('NOT_FOUND');
    });
  });

  describe('GitHub webhook specific examples', () => {
    it('should handle common GitHub webhook patterns', () => {
      // Common patterns from GitHub webhooks
      expect(resolver.resolve(samplePayload, 'repository.full_name')).toBe('owner/test-repo');
      expect(resolver.resolve(samplePayload, 'pull_request.labels[*].name')).toEqual([
        'enhancement', 'priority-high', 'review-needed'
      ]);
      expect(resolver.resolve(samplePayload, 'issue.assignees[*].login')).toEqual([
        'maintainer1', 'maintainer2'
      ]);
      expect(resolver.resolve(samplePayload, 'commits[*].author.email')).toEqual([
        'dev1@example.com', 'dev2@example.com'
      ]);
    });

    it('should handle review filtering', () => {
      const approvedReviewers = resolver.resolve(
        samplePayload, 
        'reviews[state="approved"][*].user.login'
      );
      expect(approvedReviewers).toEqual(['reviewer1', 'reviewer3']);
    });

    it('should safely handle missing webhook fields', () => {
      // These might not exist in all webhook types
      expect(resolver.resolve(samplePayload, 'release.tag_name')).toBeUndefined();
      expect(resolver.resolve(samplePayload, 'deployment.environment')).toBeUndefined();
      expect(resolver.resolve(samplePayload, 'check_run.conclusion')).toBeUndefined();
    });
  });
});