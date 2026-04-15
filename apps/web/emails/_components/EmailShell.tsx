/**
 * Shared email layout for every Part 61 School transactional email.
 *
 * Utility design (no branding system yet — RESEARCH Open Q4).
 * If the school adopts the Documentation/ design language later,
 * only this component needs updating.
 */
import { Body, Container, Head, Heading, Hr, Html, Text } from '@react-email/components';
import type { ReactNode } from 'react';

interface Props {
  heading: string;
  /** Footer line describing which notification bucket drove this send. */
  footerCategory: string;
  children: ReactNode;
}

const BODY_STYLE: React.CSSProperties = {
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, sans-serif",
  background: '#f9fafb',
  margin: 0,
  padding: 0,
};

const CONTAINER_STYLE: React.CSSProperties = {
  maxWidth: 560,
  margin: '32px auto',
  padding: 24,
  background: '#ffffff',
  borderRadius: 8,
  border: '1px solid #e5e7eb',
};

const HEADING_STYLE: React.CSSProperties = {
  fontSize: '1.25rem',
  fontWeight: 700,
  color: '#111827',
  marginTop: 0,
};

const FOOTER_STYLE: React.CSSProperties = {
  fontSize: 12,
  color: '#6b7280',
  marginTop: 24,
};

export function EmailShell({ heading, footerCategory, children }: Props) {
  return (
    <Html>
      <Head />
      <Body style={BODY_STYLE}>
        <Container style={CONTAINER_STYLE}>
          <Heading as="h1" style={HEADING_STYLE}>
            {heading}
          </Heading>
          {children}
          <Hr style={{ borderColor: '#e5e7eb', margin: '24px 0' }} />
          <Text style={FOOTER_STYLE}>
            Part 61 School · You received this because {footerCategory} notifications are on in your
            profile.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
