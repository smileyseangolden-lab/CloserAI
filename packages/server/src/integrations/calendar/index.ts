import type { CalendarProvider, MeetingRequest, TimeSlot } from '../types.js';
import { nanoid } from 'nanoid';

class StubCalendarProvider implements CalendarProvider {
  async getAvailability(_userId: string, range: { start: Date; end: Date }): Promise<TimeSlot[]> {
    // Returns three 30-minute slots in the window as stub data.
    const base = range.start.getTime();
    return [0, 1, 2].map((i) => ({
      start: new Date(base + i * 60 * 60 * 1000),
      end: new Date(base + i * 60 * 60 * 1000 + 30 * 60 * 1000),
    }));
  }

  async createMeeting(meeting: MeetingRequest) {
    return {
      meetingId: `stub-${nanoid(8)}`,
      joinUrl: `https://meet.example.com/${nanoid(8)}`,
    };
  }
}

let cached: CalendarProvider | null = null;
export function getCalendarProvider(): CalendarProvider {
  if (!cached) cached = new StubCalendarProvider();
  return cached;
}
