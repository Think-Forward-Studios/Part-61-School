/**
 * Grading complete — fires to the student when an instructor seals a
 * lesson grade sheet. Routes to /record.
 */
import { Button, Text } from '@react-email/components';
import { EmailShell } from './_components/EmailShell';

export interface GradingCompleteProps {
  studentName: string;
  instructorName: string;
  lessonTitle: string;
  recordUrl: string;
}

export function GradingComplete(props: GradingCompleteProps) {
  return (
    <EmailShell heading="Your lesson has been graded" footerCategory="grading">
      <Text>Hi {props.studentName},</Text>
      <Text>
        <strong>{props.instructorName}</strong> has finished grading your{' '}
        <strong>{props.lessonTitle}</strong> lesson. The results are in your training record.
      </Text>
      <Button
        href={props.recordUrl}
        style={{
          background: '#1e40af',
          color: '#ffffff',
          padding: '10px 16px',
          borderRadius: 4,
          textDecoration: 'none',
          display: 'inline-block',
        }}
      >
        Open my record
      </Button>
    </EmailShell>
  );
}

export default GradingComplete;
