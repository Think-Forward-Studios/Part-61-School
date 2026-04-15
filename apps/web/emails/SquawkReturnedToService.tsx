/**
 * Squawk returned to service — fires to the original opener + affected
 * instructors when an aircraft is cleared for flight after repair.
 */
import { Text } from '@react-email/components';
import { EmailShell } from './_components/EmailShell';

export interface SquawkReturnedToServiceProps {
  recipientName: string;
  aircraftTail: string;
  mechanicName: string;
}

export function SquawkReturnedToService(props: SquawkReturnedToServiceProps) {
  return (
    <EmailShell heading="Aircraft returned to service" footerCategory="squawk">
      <Text>Hi {props.recipientName},</Text>
      <Text>
        <strong>{props.aircraftTail}</strong> has been returned to service by{' '}
        <strong>{props.mechanicName}</strong>. It is cleared for flight.
      </Text>
    </EmailShell>
  );
}

export default SquawkReturnedToService;
