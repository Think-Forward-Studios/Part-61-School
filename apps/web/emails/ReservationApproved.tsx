/**
 * Reservation confirmed — fires to the student when an instructor or
 * admin confirms their reservation.
 *
 * NOTE: "confirmed" not "approved" in user-facing copy per banned-terms
 * rule. Internal reservation.status enum value stays 'approved' — that
 * lives in the DB, not in this template.
 */
import { Button, Text } from '@react-email/components';
import { EmailShell } from './_components/EmailShell';

export interface ReservationApprovedProps {
  studentName: string;
  instructorName: string;
  aircraftTail: string;
  startTimeLocal: string;
  reservationUrl: string;
}

export function ReservationApproved(props: ReservationApprovedProps) {
  return (
    <EmailShell heading="Your reservation is confirmed" footerCategory="reservation">
      <Text>Hi {props.studentName},</Text>
      <Text>
        Your flight with <strong>{props.instructorName}</strong> in{' '}
        <strong>{props.aircraftTail}</strong> on {props.startTimeLocal} is confirmed and on the
        schedule.
      </Text>
      <Button
        href={props.reservationUrl}
        style={{
          background: '#1e40af',
          color: '#ffffff',
          padding: '10px 16px',
          borderRadius: 4,
          textDecoration: 'none',
          display: 'inline-block',
        }}
      >
        View reservation
      </Button>
    </EmailShell>
  );
}

export default ReservationApproved;
