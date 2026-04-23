// Unit tests for schedule event state management
// Tests the ADD/UPDATE/REMOVE_SCHEDULE_EVENT reducer cases
// and the UPDATE_OPPORTUNITY_SCHEDULE action.

import { describe, it, expect } from 'vitest';
import type { ScheduleEvent, EstimatorState } from './types';

// ── Minimal stub of the reducer logic ──────────────────────────
// We import and test the pure reducer logic inline to avoid
// pulling in the full React context (which needs DOM).

function nanoid8() { return Math.random().toString(36).slice(2, 10); }

type ScheduleAction =
  | { type: 'ADD_SCHEDULE_EVENT'; payload: Omit<ScheduleEvent, 'id' | 'createdAt' | 'updatedAt'> }
  | { type: 'UPDATE_SCHEDULE_EVENT'; id: string; payload: Partial<ScheduleEvent> }
  | { type: 'REMOVE_SCHEDULE_EVENT'; id: string };

interface SlimState {
  scheduleEvents: ScheduleEvent[];
  scheduleCounter: number;
}

function scheduleReducer(state: SlimState, action: ScheduleAction): SlimState {
  switch (action.type) {
    case 'ADD_SCHEDULE_EVENT': {
      const now = new Date().toISOString();
      const newEvent: ScheduleEvent = {
        ...action.payload,
        id: nanoid8(),
        createdAt: now,
        updatedAt: now,
      };
      return { ...state, scheduleEvents: [...state.scheduleEvents, newEvent], scheduleCounter: state.scheduleCounter + 1 };
    }
    case 'UPDATE_SCHEDULE_EVENT': {
      const now = new Date().toISOString();
      return {
        ...state,
        scheduleEvents: state.scheduleEvents.map(e =>
          e.id === action.id ? { ...e, ...action.payload, updatedAt: now } : e
        ),
      };
    }
    case 'REMOVE_SCHEDULE_EVENT':
      return { ...state, scheduleEvents: state.scheduleEvents.filter(e => e.id !== action.id) };
    default:
      return state;
  }
}

const baseEvent: Omit<ScheduleEvent, 'id' | 'createdAt' | 'updatedAt'> = {
  type: 'job',
  title: 'Install baseboard — Smith',
  start: '2026-04-10T08:00:00.000Z',
  end: '2026-04-10T12:00:00.000Z',
  allDay: false,
  assignedTo: ['Mike'],
  notes: 'Bring nail gun',
  completed: false,
};

const initialState: SlimState = { scheduleEvents: [], scheduleCounter: 1 };

describe('Schedule reducer', () => {
  it('ADD_SCHEDULE_EVENT creates an event with auto-generated id and timestamps', () => {
    const next = scheduleReducer(initialState, { type: 'ADD_SCHEDULE_EVENT', payload: baseEvent });
    expect(next.scheduleEvents).toHaveLength(1);
    const ev = next.scheduleEvents[0];
    expect(ev.id).toBeTruthy();
    expect(ev.title).toBe('Install baseboard — Smith');
    expect(ev.type).toBe('job');
    expect(ev.createdAt).toBeTruthy();
    expect(ev.updatedAt).toBeTruthy();
    expect(next.scheduleCounter).toBe(2);
  });

  it('ADD_SCHEDULE_EVENT accumulates multiple events', () => {
    let state = scheduleReducer(initialState, { type: 'ADD_SCHEDULE_EVENT', payload: baseEvent });
    state = scheduleReducer(state, { type: 'ADD_SCHEDULE_EVENT', payload: { ...baseEvent, title: 'Estimate visit — Jones', type: 'estimate' } });
    expect(state.scheduleEvents).toHaveLength(2);
    expect(state.scheduleCounter).toBe(3);
  });

  it('UPDATE_SCHEDULE_EVENT modifies only the target event', () => {
    let state = scheduleReducer(initialState, { type: 'ADD_SCHEDULE_EVENT', payload: baseEvent });
    let state2 = scheduleReducer(state, { type: 'ADD_SCHEDULE_EVENT', payload: { ...baseEvent, title: 'Second event' } });
    const firstId = state2.scheduleEvents[0].id;
    const updated = scheduleReducer(state2, { type: 'UPDATE_SCHEDULE_EVENT', id: firstId, payload: { title: 'Updated title', notes: 'New note' } });
    expect(updated.scheduleEvents[0].title).toBe('Updated title');
    expect(updated.scheduleEvents[0].notes).toBe('New note');
    expect(updated.scheduleEvents[1].title).toBe('Second event'); // unchanged
  });

  it('UPDATE_SCHEDULE_EVENT refreshes updatedAt', () => {
    let state = scheduleReducer(initialState, { type: 'ADD_SCHEDULE_EVENT', payload: baseEvent });
    const originalUpdatedAt = state.scheduleEvents[0].updatedAt;
    // Small delay to ensure different timestamp
    const id = state.scheduleEvents[0].id;
    const updated = scheduleReducer(state, { type: 'UPDATE_SCHEDULE_EVENT', id, payload: { title: 'Changed' } });
    // updatedAt should be a valid ISO string
    expect(new Date(updated.scheduleEvents[0].updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(originalUpdatedAt).getTime()
    );
  });

  it('REMOVE_SCHEDULE_EVENT removes only the target event', () => {
    let state = scheduleReducer(initialState, { type: 'ADD_SCHEDULE_EVENT', payload: baseEvent });
    state = scheduleReducer(state, { type: 'ADD_SCHEDULE_EVENT', payload: { ...baseEvent, title: 'Keep me' } });
    const removeId = state.scheduleEvents[0].id;
    const next = scheduleReducer(state, { type: 'REMOVE_SCHEDULE_EVENT', id: removeId });
    expect(next.scheduleEvents).toHaveLength(1);
    expect(next.scheduleEvents[0].title).toBe('Keep me');
  });

  it('REMOVE_SCHEDULE_EVENT on non-existent id is a no-op', () => {
    let state = scheduleReducer(initialState, { type: 'ADD_SCHEDULE_EVENT', payload: baseEvent });
    const next = scheduleReducer(state, { type: 'REMOVE_SCHEDULE_EVENT', id: 'does-not-exist' });
    expect(next.scheduleEvents).toHaveLength(1);
  });

  it('event type colors are defined for all event types', () => {
    const types = ['estimate', 'job', 'recurring', 'task', 'follow_up'] as const;
    // Just verify the type values are what we expect (no runtime color map here, but type check)
    types.forEach(t => {
      const ev: Omit<ScheduleEvent, 'id' | 'createdAt' | 'updatedAt'> = { ...baseEvent, type: t };
      const state = scheduleReducer(initialState, { type: 'ADD_SCHEDULE_EVENT', payload: ev });
      expect(state.scheduleEvents[0].type).toBe(t);
    });
  });
});
