/**
 * Duty hour warning — fires to an instructor whose scheduled flights
 * within a rolling 24-hour window approach FAR 61.195(a)(2)'s 8-hour
 * flight-instruction limit.
 */
import { Text } from '@react-email/components';
import { EmailShell } from './_components/EmailShell';

export interface DutyHourWarningProps {
  instructorName: string;
  windowStartLocal: string;
  windowEndLocal: string;
  scheduledMinutes: number;
  limitMinutes: number;
}

export function DutyHourWarning(props: DutyHourWarningProps) {
  const hours = (props.scheduledMinutes / 60).toFixed(1);
  const limit = (props.limitMinutes / 60).toFixed(1);
  return (
    <EmailShell heading="Duty-hour warning — nearing limit" footerCategory="duty-hour">
      <Text>Hi {props.instructorName},</Text>
      <Text>
        Between {props.windowStartLocal} and {props.windowEndLocal} you are scheduled for{' '}
        <strong>{hours}</strong> hours of flight instruction. FAR 61.195(a)(2) limits flight
        instruction to <strong>{limit}</strong> hours per 24-hour period.
      </Text>
      <Text>
        Please review your schedule — additional reservations in this window may not be permitted.
      </Text>
    </EmailShell>
  );
}

export default DutyHourWarning;
