/**
 * IacraPdfDocument — IACRA 8710-1 hours summary (SYL-11).
 *
 * This is a DATA-ENTRY AID for the real 8710-1 form. It is not submitted
 * to IACRA directly. Banned-term clean.
 */
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import {
  minutesToHours,
  type IacraTotals,
  type TrainingRecordIdentification,
} from '@/lib/trainingRecord';

const styles = StyleSheet.create({
  page: {
    padding: 32,
    paddingBottom: 50,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#000',
  },
  title: { fontSize: 16, fontFamily: 'Helvetica-Bold' },
  subtitle: { fontSize: 9, color: '#333', marginTop: 2 },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    paddingBottom: 6,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginTop: 10,
    marginBottom: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: '#000',
    paddingBottom: 2,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#ccc',
    paddingVertical: 3,
  },
  label: { width: '60%' },
  hours: { width: '20%', textAlign: 'right' },
  minutes: { width: '20%', textAlign: 'right', color: '#666' },
  bold: { fontFamily: 'Helvetica-Bold' },
  footer: {
    position: 'absolute',
    bottom: 18,
    left: 32,
    right: 32,
    fontSize: 7,
    color: '#333',
    borderTopWidth: 0.5,
    borderTopColor: '#999',
    paddingTop: 4,
  },
});

type Props = {
  identification: TrainingRecordIdentification;
  totals: IacraTotals;
  schoolName: string;
  generatedAt: string;
};

function Row({ label, minutes, bold }: { label: string; minutes: number; bold?: boolean }) {
  return (
    <View style={styles.row} wrap={false}>
      <Text style={[styles.label, bold ? styles.bold : {}]}>{label}</Text>
      <Text style={[styles.hours, bold ? styles.bold : {}]}>{minutesToHours(minutes)}</Text>
      <Text style={styles.minutes}>{minutes} min</Text>
    </View>
  );
}

function LandingsRow({ label, count }: { label: string; count: number }) {
  return (
    <View style={styles.row} wrap={false}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.hours}>{count}</Text>
      <Text style={styles.minutes}></Text>
    </View>
  );
}

export function IacraPdfDocument(props: Props) {
  const { identification, totals, schoolName, generatedAt } = props;
  return (
    <Document
      title={`IACRA 8710-1 hours summary - ${identification.fullName}`}
      author={schoolName}
    >
      <Page size="LETTER" style={styles.page} wrap>
        <View style={styles.header}>
          <Text style={styles.title}>IACRA 8710-1 Hours Summary</Text>
          <Text style={styles.subtitle}>
            {schoolName} · 14 CFR 61.51(e) totals · generated {generatedAt}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Applicant</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Name</Text>
          <Text style={{ width: '40%', textAlign: 'right' }}>{identification.fullName}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>FAA airman cert #</Text>
          <Text style={{ width: '40%', textAlign: 'right' }}>
            {identification.faaCertNumber ?? '—'}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Date of birth</Text>
          <Text style={{ width: '40%', textAlign: 'right' }}>
            {identification.dateOfBirth ?? '—'}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Totals (per 14 CFR 61.51(e))</Text>
        <Row label="Total time" minutes={totals.totalMinutes} bold />
        <Row label="PIC time" minutes={totals.picMinutes} />
        <Row label="SIC time" minutes={totals.sicMinutes} />
        <Row label="Solo time" minutes={totals.soloMinutes} />
        <Row label="Dual received" minutes={totals.dualReceivedMinutes} />
        <Row label="Dual given (instructor)" minutes={totals.dualGivenMinutes} />
        <Row label="Cross-country" minutes={totals.crossCountryMinutes} />
        <Row label="Night" minutes={totals.nightMinutes} />
        <Row label="Instrument — actual" minutes={totals.instrumentActualMinutes} />
        <Row label="Instrument — simulated" minutes={totals.instrumentSimulatedMinutes} />
        <Row label="Flight simulator / FTD" minutes={totals.simulatorMinutes} />

        <Text style={styles.sectionTitle}>Landings & Approaches</Text>
        <LandingsRow label="Day landings" count={totals.dayLandings} />
        <LandingsRow label="Night landings" count={totals.nightLandings} />
        <LandingsRow label="Instrument approaches" count={totals.instrumentApproaches} />

        <Text style={styles.sectionTitle}>Time in Make/Model</Text>
        {totals.timeInMakeModel.length === 0 ? (
          <Text style={{ fontStyle: 'italic' }}>No categorized flight time on file.</Text>
        ) : (
          totals.timeInMakeModel.map((mm) => (
            <Row key={mm.makeModel} label={mm.makeModel} minutes={mm.minutes} />
          ))
        )}

        <View style={styles.footer} fixed>
          <Text>
            Copy values into IACRA 8710-1. This export is a data-entry aid, not an official
            IACRA form and is not submitted to IACRA directly.
          </Text>
        </View>
      </Page>
    </Document>
  );
}
