import { ActionConfig } from '../types/workflow-schema';
import { logger } from '../utils/logger';

export interface ExecutionStage {
  stage: number;
  actions: ActionConfig[];
  dependencies: string[];
}

export class DependencyResolver {
  /**
   * Resolve execution order for actions based on their dependencies
   * Returns stages where actions in each stage can run in parallel
   */
  public resolveExecutionOrder(actions: ActionConfig[]): ActionConfig[][] {
    // Build dependency graph
    const graph = this.buildDependencyGraph(actions);
    
    // Validate for circular dependencies
    this.validateNoCycles(graph);
    
    // Perform topological sort to determine execution order
    const sortedActions = this.topologicalSort(graph, actions);
    
    // Group actions into stages that can run in parallel
    const stages = this.groupIntoStages(sortedActions, graph);
    
    logger.debug(`Dependency resolution completed`, {
      totalActions: actions.length,
      stages: stages.length,
      stageDistribution: stages.map(stage => stage.length)
    });
    
    return stages;
  }

  /**
   * Build dependency graph from actions
   */
  private buildDependencyGraph(actions: ActionConfig[]): Map<string, Set<string>> {
    const graph = new Map<string, Set<string>>();
    const actionIds = new Set<string>();
    
    // Initialize graph with all action IDs
    actions.forEach(action => {
      const actionId = action.id || this.generateActionId(action);
      actionIds.add(actionId);
      graph.set(actionId, new Set());
    });
    
    // Add dependencies
    actions.forEach(action => {
      const actionId = action.id || this.generateActionId(action);
      const dependencies = action.dependsOn || [];
      
      dependencies.forEach(depId => {
        if (!actionIds.has(depId)) {
          throw new Error(`Action '${actionId}' depends on unknown action '${depId}'`);
        }
        graph.get(actionId)!.add(depId);
      });
    });
    
    return graph;
  }

  /**
   * Validate that there are no circular dependencies
   */
  private validateNoCycles(graph: Map<string, Set<string>>): void {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    const hasCycle = (nodeId: string): boolean => {
      if (recursionStack.has(nodeId)) {
        return true; // Cycle detected
      }
      if (visited.has(nodeId)) {
        return false; // Already processed
      }
      
      visited.add(nodeId);
      recursionStack.add(nodeId);
      
      const dependencies = graph.get(nodeId) || new Set();
      for (const depId of dependencies) {
        if (hasCycle(depId)) {
          return true;
        }
      }
      
      recursionStack.delete(nodeId);
      return false;
    };
    
    for (const nodeId of graph.keys()) {
      if (hasCycle(nodeId)) {
        throw new Error(`Circular dependency detected involving action '${nodeId}'`);
      }
    }
  }

  /**
   * Perform topological sort using Kahn's algorithm
   */
  private topologicalSort(graph: Map<string, Set<string>>, actions: ActionConfig[]): ActionConfig[] {
    // Create reverse graph (dependents)
    const reverseGraph = new Map<string, Set<string>>();
    const inDegree = new Map<string, number>();
    
    // Initialize
    graph.forEach((deps, actionId) => {
      reverseGraph.set(actionId, new Set());
      inDegree.set(actionId, deps.size);
    });
    
    // Build reverse graph
    graph.forEach((deps, actionId) => {
      deps.forEach(depId => {
        reverseGraph.get(depId)!.add(actionId);
      });
    });
    
    // Find nodes with no incoming edges
    const queue: string[] = [];
    inDegree.forEach((degree, actionId) => {
      if (degree === 0) {
        queue.push(actionId);
      }
    });
    
    const sortedIds: string[] = [];
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      sortedIds.push(current);
      
      // Process dependents
      const dependents = reverseGraph.get(current) || new Set();
      dependents.forEach(dependent => {
        const newDegree = inDegree.get(dependent)! - 1;
        inDegree.set(dependent, newDegree);
        
        if (newDegree === 0) {
          queue.push(dependent);
        }
      });
    }
    
    if (sortedIds.length !== graph.size) {
      throw new Error('Topological sort failed - circular dependencies detected');
    }
    
    // Map sorted IDs back to actions
    const actionMap = new Map<string, ActionConfig>();
    actions.forEach(action => {
      const actionId = action.id || this.generateActionId(action);
      actionMap.set(actionId, action);
    });
    
    return sortedIds.map(id => actionMap.get(id)!);
  }

  /**
   * Group actions into stages that can run in parallel
   */
  private groupIntoStages(sortedActions: ActionConfig[], graph: Map<string, Set<string>>): ActionConfig[][] {
    const stages: ActionConfig[][] = [];
    const processed = new Set<string>();
    const actionLevels = new Map<string, number>();
    
    // Calculate the level (stage) for each action
    sortedActions.forEach(action => {
      const actionId = action.id || this.generateActionId(action);
      const dependencies = graph.get(actionId) || new Set();
      
      if (dependencies.size === 0) {
        // No dependencies, can run in stage 0
        actionLevels.set(actionId, 0);
      } else {
        // Must run after all dependencies complete
        let maxDepLevel = -1;
        dependencies.forEach(depId => {
          const depLevel = actionLevels.get(depId);
          if (depLevel !== undefined) {
            maxDepLevel = Math.max(maxDepLevel, depLevel);
          }
        });
        actionLevels.set(actionId, maxDepLevel + 1);
      }
    });
    
    // Group actions by their levels
    const levelGroups = new Map<number, ActionConfig[]>();
    sortedActions.forEach(action => {
      const actionId = action.id || this.generateActionId(action);
      const level = actionLevels.get(actionId)!;
      
      if (!levelGroups.has(level)) {
        levelGroups.set(level, []);
      }
      levelGroups.get(level)!.push(action);
    });
    
    // Convert to array of stages
    const maxLevel = Math.max(...actionLevels.values());
    for (let i = 0; i <= maxLevel; i++) {
      stages.push(levelGroups.get(i) || []);
    }
    
    return stages.filter(stage => stage.length > 0);
  }

  /**
   * Generate action ID if not provided
   */
  private generateActionId(action: ActionConfig): string {
    return `${action.type}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  }

  /**
   * Analyze dependency complexity
   */
  public analyzeDependencyComplexity(actions: ActionConfig[]): DependencyAnalysis {
    const graph = this.buildDependencyGraph(actions);
    const stages = this.groupIntoStages(this.topologicalSort(graph, actions), graph);
    
    // Calculate metrics
    const totalActions = actions.length;
    const actionsWithDependencies = actions.filter(a => a.dependsOn && a.dependsOn.length > 0).length;
    const maxDependenciesPerAction = Math.max(0, ...actions.map(a => a.dependsOn?.length || 0));
    const totalDependencies = actions.reduce((sum, a) => sum + (a.dependsOn?.length || 0), 0);
    const parallelizationRatio = totalActions > 0 ? (totalActions - stages.length) / totalActions : 0;
    
    // Find critical path (longest path through dependencies)
    const criticalPath = this.findCriticalPath(graph, actions);
    
    return {
      totalActions,
      actionsWithDependencies,
      maxDependenciesPerAction,
      totalDependencies,
      stages: stages.length,
      maxParallelActions: Math.max(...stages.map(stage => stage.length)),
      minParallelActions: Math.min(...stages.map(stage => stage.length)),
      parallelizationRatio,
      criticalPath,
      averageDependenciesPerAction: totalActions > 0 ? totalDependencies / totalActions : 0
    };
  }

  /**
   * Find the critical path (longest dependency chain)
   */
  private findCriticalPath(graph: Map<string, Set<string>>, actions: ActionConfig[]): string[] {
    const memo = new Map<string, string[]>();
    
    const findLongestPath = (actionId: string): string[] => {
      if (memo.has(actionId)) {
        return memo.get(actionId)!;
      }
      
      const dependencies = graph.get(actionId) || new Set();
      if (dependencies.size === 0) {
        const path = [actionId];
        memo.set(actionId, path);
        return path;
      }
      
      let longestPath: string[] = [];
      dependencies.forEach(depId => {
        const depPath = findLongestPath(depId);
        if (depPath.length > longestPath.length) {
          longestPath = depPath;
        }
      });
      
      const path = [...longestPath, actionId];
      memo.set(actionId, path);
      return path;
    };
    
    let criticalPath: string[] = [];
    graph.forEach((_, actionId) => {
      const path = findLongestPath(actionId);
      if (path.length > criticalPath.length) {
        criticalPath = path;
      }
    });
    
    return criticalPath;
  }

  /**
   * Validate dependencies exist and are valid
   */
  public validateDependencies(actions: ActionConfig[]): DependencyValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const actionIds = new Set(actions.map(a => a.id).filter(Boolean));
    
    actions.forEach((action, index) => {
      const actionId = action.id || `action-${index}`;
      
      if (action.dependsOn) {
        action.dependsOn.forEach(depId => {
          if (!actionIds.has(depId)) {
            errors.push(`Action '${actionId}' depends on unknown action '${depId}'`);
          }
        });
        
        // Check for self-dependency
        if (action.dependsOn.includes(actionId)) {
          errors.push(`Action '${actionId}' cannot depend on itself`);
        }
      }
    });
    
    // Check for potential performance issues
    const actionsWithManyDeps = actions.filter(a => (a.dependsOn?.length || 0) > 5);
    if (actionsWithManyDeps.length > 0) {
      warnings.push(`${actionsWithManyDeps.length} actions have more than 5 dependencies, which may impact performance`);
    }
    
    try {
      const graph = this.buildDependencyGraph(actions);
      this.validateNoCycles(graph);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Dependency validation failed');
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Optimize action ordering for better performance
   */
  public optimizeActionOrder(actions: ActionConfig[]): ActionConfig[] {
    // Sort actions to minimize dependency resolution time
    // Actions with no dependencies first, then by dependency count
    return [...actions].sort((a, b) => {
      const aDeps = a.dependsOn?.length || 0;
      const bDeps = b.dependsOn?.length || 0;
      
      if (aDeps !== bDeps) {
        return aDeps - bDeps;
      }
      
      // Secondary sort by action type for consistency
      return a.type.localeCompare(b.type);
    });
  }
}

export interface DependencyAnalysis {
  totalActions: number;
  actionsWithDependencies: number;
  maxDependenciesPerAction: number;
  totalDependencies: number;
  stages: number;
  maxParallelActions: number;
  minParallelActions: number;
  parallelizationRatio: number;
  criticalPath: string[];
  averageDependenciesPerAction: number;
}

export interface DependencyValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}