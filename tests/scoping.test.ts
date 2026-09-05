import { describe, expect, it } from 'vitest';
import {
  isGlobalRole,
  isPracticeScopedRole,
  isProjectInScope,
  isResourceInScope,
  getScopedResourceWhere,
  type ScopeIdentity,
} from '@/lib/scoping';
import type { OrgContext } from '@/lib/session';
import type { DeliveryRole } from '@/lib/auth/rbac';

const ALL_ROLES: DeliveryRole[] = ['ADMIN', 'VP_EXECUTIVE', 'PRACTICE_DIRECTOR', 'DELIVERY_MANAGER', 'PROJECT_MANAGER'];

function identity(overrides: Partial<ScopeIdentity>): ScopeIdentity {
  return { deliveryRole: 'PROJECT_MANAGER', resourceId: null, resourcePracticeId: null, ...overrides };
}

describe('isGlobalRole / isPracticeScopedRole', () => {
  it('classifies every real DeliveryRole into exactly one of global, practice-scoped, or neither', () => {
    for (const role of ALL_ROLES) {
      const global = isGlobalRole(role);
      const practiceScoped = isPracticeScopedRole(role);
      expect(global && practiceScoped).toBe(false); // mutually exclusive
    }
    expect(isGlobalRole('ADMIN')).toBe(true);
    expect(isGlobalRole('VP_EXECUTIVE')).toBe(true);
    expect(isGlobalRole('PRACTICE_DIRECTOR')).toBe(false);
    expect(isGlobalRole('DELIVERY_MANAGER')).toBe(false);
    expect(isGlobalRole('PROJECT_MANAGER')).toBe(false);

    expect(isPracticeScopedRole('PRACTICE_DIRECTOR')).toBe(true);
    expect(isPracticeScopedRole('DELIVERY_MANAGER')).toBe(true);
    expect(isPracticeScopedRole('PROJECT_MANAGER')).toBe(false);
    expect(isPracticeScopedRole('ADMIN')).toBe(false);
  });
});

describe('isProjectInScope', () => {
  const project = {
    practiceDirectorId: 'pd-1',
    practiceId: 'practice-1',
    deliveryManagerId: 'dm-1',
    projectManagerId: 'pm-1',
  };

  it('ADMIN and VP_EXECUTIVE see every project regardless of assignment', () => {
    expect(isProjectInScope(identity({ deliveryRole: 'ADMIN' }), project)).toBe(true);
    expect(isProjectInScope(identity({ deliveryRole: 'VP_EXECUTIVE', resourceId: 'nobody' }), project)).toBe(true);
  });

  describe('PRACTICE_DIRECTOR', () => {
    it('sees a project they are the named PD on, even outside their home practice', () => {
      const id = identity({ deliveryRole: 'PRACTICE_DIRECTOR', resourceId: 'pd-1', resourcePracticeId: 'other-practice' });
      expect(isProjectInScope(id, project)).toBe(true);
    });

    it('sees a project in their home practice, even if a different PD is named', () => {
      const id = identity({ deliveryRole: 'PRACTICE_DIRECTOR', resourceId: 'someone-else', resourcePracticeId: 'practice-1' });
      expect(isProjectInScope(id, project)).toBe(true);
    });

    it('does not see a project that is neither theirs nor in their practice', () => {
      const id = identity({ deliveryRole: 'PRACTICE_DIRECTOR', resourceId: 'someone-else', resourcePracticeId: 'other-practice' });
      expect(isProjectInScope(id, project)).toBe(false);
    });

    it('a PD with no resource link and no practice sees nothing', () => {
      expect(isProjectInScope(identity({ deliveryRole: 'PRACTICE_DIRECTOR' }), project)).toBe(false);
    });
  });

  describe('DELIVERY_MANAGER', () => {
    it('sees a project they are the named DM on', () => {
      const id = identity({ deliveryRole: 'DELIVERY_MANAGER', resourceId: 'dm-1' });
      expect(isProjectInScope(id, project)).toBe(true);
    });

    it('sees a project led by a direct-report PM', () => {
      const id = identity({ deliveryRole: 'DELIVERY_MANAGER', resourceId: 'dm-2' });
      expect(isProjectInScope(id, project, ['pm-1'])).toBe(true);
    });

    it('does not see a project led by a PM who is not their direct report', () => {
      const id = identity({ deliveryRole: 'DELIVERY_MANAGER', resourceId: 'dm-2' });
      expect(isProjectInScope(id, project, ['someone-else'])).toBe(false);
    });

    it('with no resourceId sees nothing', () => {
      expect(isProjectInScope(identity({ deliveryRole: 'DELIVERY_MANAGER' }), project, ['pm-1'])).toBe(false);
    });
  });

  describe('PROJECT_MANAGER', () => {
    it('sees only the project they are the named PM of record on', () => {
      expect(isProjectInScope(identity({ deliveryRole: 'PROJECT_MANAGER', resourceId: 'pm-1' }), project)).toBe(true);
      expect(isProjectInScope(identity({ deliveryRole: 'PROJECT_MANAGER', resourceId: 'pm-2' }), project)).toBe(false);
    });
  });
});

describe('isResourceInScope', () => {
  const resource = { id: 'res-1', practiceId: 'practice-1', managerId: 'mgr-1' };

  it('ADMIN and VP_EXECUTIVE see every resource', () => {
    expect(isResourceInScope(identity({ deliveryRole: 'ADMIN' }), resource)).toBe(true);
    expect(isResourceInScope(identity({ deliveryRole: 'VP_EXECUTIVE' }), resource)).toBe(true);
  });

  it('PRACTICE_DIRECTOR sees every resource in their own practiceId', () => {
    const id = identity({ deliveryRole: 'PRACTICE_DIRECTOR', resourcePracticeId: 'practice-1' });
    expect(isResourceInScope(id, resource)).toBe(true);
    expect(isResourceInScope({ ...id, resourcePracticeId: 'other-practice' }, resource)).toBe(false);
  });

  it('a PRACTICE_DIRECTOR with no practice on file falls back to seeing only themself', () => {
    const id = identity({ deliveryRole: 'PRACTICE_DIRECTOR', resourceId: 'res-1' });
    expect(isResourceInScope(id, resource)).toBe(true);
    expect(isResourceInScope({ ...id, resourceId: 'someone-else' }, resource)).toBe(false);
  });

  it('DELIVERY_MANAGER sees themself and their direct reports, never a peer', () => {
    const asTheManager = identity({ deliveryRole: 'DELIVERY_MANAGER', resourceId: 'mgr-1' });
    expect(isResourceInScope(asTheManager, resource)).toBe(true); // direct report
    expect(isResourceInScope({ ...asTheManager, resourceId: 'res-1' }, resource)).toBe(true); // themself
    expect(isResourceInScope({ ...asTheManager, resourceId: 'unrelated' }, resource)).toBe(false);
  });

  it('PROJECT_MANAGER sees only themself', () => {
    expect(isResourceInScope(identity({ deliveryRole: 'PROJECT_MANAGER', resourceId: 'res-1' }), resource)).toBe(true);
    expect(isResourceInScope(identity({ deliveryRole: 'PROJECT_MANAGER', resourceId: 'someone-else' }), resource)).toBe(false);
  });
});

describe('getScopedResourceWhere', () => {
  function ctx(overrides: Partial<ScopeIdentity>): OrgContext {
    return {
      organizationId: 'org-1',
      ...identity(overrides),
    } as OrgContext;
  }

  it('is unrestricted (org-only) for ADMIN and VP_EXECUTIVE', () => {
    expect(getScopedResourceWhere(ctx({ deliveryRole: 'ADMIN' }))).toEqual({ organizationId: 'org-1' });
    expect(getScopedResourceWhere(ctx({ deliveryRole: 'VP_EXECUTIVE' }))).toEqual({ organizationId: 'org-1' });
  });

  it('filters by practiceId for a PRACTICE_DIRECTOR with a practice on file', () => {
    expect(getScopedResourceWhere(ctx({ deliveryRole: 'PRACTICE_DIRECTOR', resourcePracticeId: 'practice-1' }))).toEqual({
      organizationId: 'org-1',
      practiceId: 'practice-1',
    });
  });

  it('matches nothing for a DELIVERY_MANAGER or PROJECT_MANAGER with no resource link (fails closed)', () => {
    const dm = getScopedResourceWhere(ctx({ deliveryRole: 'DELIVERY_MANAGER' }));
    const pm = getScopedResourceWhere(ctx({ deliveryRole: 'PROJECT_MANAGER' }));
    expect(dm).toEqual({ id: { in: [] } });
    expect(pm).toEqual({ id: { in: [] } });
  });

  it('is an OR of self + direct reports for a DELIVERY_MANAGER', () => {
    expect(getScopedResourceWhere(ctx({ deliveryRole: 'DELIVERY_MANAGER', resourceId: 'dm-1' }))).toEqual({
      organizationId: 'org-1',
      OR: [{ id: 'dm-1' }, { managerId: 'dm-1' }],
    });
  });
});
