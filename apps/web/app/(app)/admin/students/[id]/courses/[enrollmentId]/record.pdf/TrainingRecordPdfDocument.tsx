/**
 * TrainingRecordPdfDocument — @react-pdf/renderer component for the
 * 14 CFR 141.101(a)(2) training record export (SYL-10 / STU-02).
 *
 * Banned-term clean: the title is "Training Record" (never the banned
 * "Part 141" literal). The CFR citation "14 CFR 141.101(a)(2)" is
 * allowed because the banned literal is the two-word "Part 141", not
 * the bare number.
 *
 * Signer snapshots are rendered as frozen strings; never re-fetched.
 */
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { TrainingRecordData, SignerDisplay } from '@/lib/trainingRecord';

const styles = StyleSheet.create({
  page: {
    padding: 28,
    paddingBottom: 50,
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: '#000',
  },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    paddingBottom: 6,
    marginBottom: 8,
  },
  title: { fontSize: 16, fontFamily: 'Helvetica-Bold' },
  subtitle: { fontSize: 9, marginTop: 2, color: '#333' },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginTop: 10,
    marginBottom: 4,
    paddingBottom: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: '#000',
  },
  kvRow: { flexDirection: 'row', marginBottom: 2 },
  kvLabel: { width: '30%', fontFamily: 'Helvetica-Bold' },
  kvVal: { width: '70%' },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    backgroundColor: '#eee',
    paddingVertical: 3,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#999',
    paddingVertical: 3,
  },
  cellDate: { width: '11%' },
  cellSubj: { width: '38%', paddingRight: 4 },
  cellMin: { width: '8%', textAlign: 'right' },
  cellSigner: { width: '35%', paddingLeft: 4 },
  headerCell: { fontFamily: 'Helvetica-Bold' },
  para: { marginTop: 3, marginBottom: 3, lineHeight: 1.3 },
  attestation: {
    marginTop: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: '#000',
  },
  footer: {
    position: 'absolute',
    bottom: 18,
    left: 28,
    right: 28,
    fontSize: 7,
    color: '#333',
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: '#999',
    paddingTop: 4,
  },
});

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return String(iso).slice(0, 10);
}

function fmtSigner(s: SignerDisplay | null): string {
  if (!s) return '—';
  return `${s.fullName}, ${s.certificateType.toUpperCase()} ${s.certificateNumber}`;
}

function lessonSubject(kind: string, code: string, title: string): string {
  const prefix = kind === 'ground' ? '[GND]' : kind === 'simulator' ? '[SIM]' : '[FLT]';
  return `${prefix} ${code} — ${title}`;
}

export function TrainingRecordPdfDocument(props: { data: TrainingRecordData }) {
  const { data } = props;
  const { identification, course, schoolName } = data;

  const fullTitle = 'Training Record';

  return (
    <Document title={`${fullTitle} - ${identification.fullName}`} author={schoolName}>
      <Page size="LETTER" style={styles.page} wrap>
        <View style={styles.header} fixed>
          <Text style={styles.title}>{fullTitle}</Text>
          <Text style={styles.subtitle}>
            {schoolName} · 14 CFR 141.101(a)(2) shape
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Student Identification</Text>
        <View style={styles.kvRow}>
          <Text style={styles.kvLabel}>Name</Text>
          <Text style={styles.kvVal}>{identification.fullName}</Text>
        </View>
        <View style={styles.kvRow}>
          <Text style={styles.kvLabel}>Date of birth</Text>
          <Text style={styles.kvVal}>{fmtDate(identification.dateOfBirth)}</Text>
        </View>
        <View style={styles.kvRow}>
          <Text style={styles.kvLabel}>FAA airman cert #</Text>
          <Text style={styles.kvVal}>{identification.faaCertNumber ?? '—'}</Text>
        </View>
        <View style={styles.kvRow}>
          <Text style={styles.kvLabel}>Address</Text>
          <Text style={styles.kvVal}>{identification.address || '—'}</Text>
        </View>
        <View style={styles.kvRow}>
          <Text style={styles.kvLabel}>Email</Text>
          <Text style={styles.kvVal}>{identification.email ?? '—'}</Text>
        </View>

        <Text style={styles.sectionTitle}>Course Identification</Text>
        <View style={styles.kvRow}>
          <Text style={styles.kvLabel}>Course</Text>
          <Text style={styles.kvVal}>
            {course.courseCode ?? '—'} · {course.courseTitle ?? '—'}
          </Text>
        </View>
        <View style={styles.kvRow}>
          <Text style={styles.kvLabel}>Rating sought</Text>
          <Text style={styles.kvVal}>{course.ratingSought ?? '—'}</Text>
        </View>
        <View style={styles.kvRow}>
          <Text style={styles.kvLabel}>Version</Text>
          <Text style={styles.kvVal}>{course.versionLabel ?? '—'}</Text>
        </View>
        <View style={styles.kvRow}>
          <Text style={styles.kvLabel}>Enrolled</Text>
          <Text style={styles.kvVal}>{fmtDate(course.enrolledAt)}</Text>
        </View>
        <View style={styles.kvRow}>
          <Text style={styles.kvLabel}>Completed</Text>
          <Text style={styles.kvVal}>
            {course.completedAt ? fmtDate(course.completedAt) : 'In progress'}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Chronological Training Log</Text>
        <View style={styles.tableHeader} fixed>
          <Text style={[styles.cellDate, styles.headerCell]}>Date</Text>
          <Text style={[styles.cellSubj, styles.headerCell]}>Subject</Text>
          <Text style={[styles.cellMin, styles.headerCell]}>Gnd</Text>
          <Text style={[styles.cellMin, styles.headerCell]}>Flt</Text>
          <Text style={[styles.cellSigner, styles.headerCell]}>Instructor</Text>
        </View>
        {data.gradeSheets.length === 0 ? (
          <View style={styles.tableRow}>
            <Text style={{ width: '100%', fontStyle: 'italic' }}>
              No sealed lesson grade sheets yet.
            </Text>
          </View>
        ) : (
          data.gradeSheets.map((g) => (
            <View key={g.id} style={styles.tableRow} wrap={false}>
              <Text style={styles.cellDate}>{fmtDate(g.conductedAt)}</Text>
              <Text style={styles.cellSubj}>
                {lessonSubject(g.kind, g.lessonCode, g.lessonTitle)}
                {g.overallRemarks ? ` — ${g.overallRemarks}` : ''}
              </Text>
              <Text style={styles.cellMin}>{g.groundMinutes}</Text>
              <Text style={styles.cellMin}>{g.flightMinutes}</Text>
              <Text style={styles.cellSigner}>{fmtSigner(g.signer)}</Text>
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>Stage Checks</Text>
        {data.stageChecks.length === 0 ? (
          <Text style={styles.para}>No stage checks on file.</Text>
        ) : (
          data.stageChecks.map((sc) => (
            <View key={sc.id} style={styles.para} wrap={false}>
              <Text>
                <Text style={styles.headerCell}>
                  {fmtDate(sc.conductedAt)} · {sc.stageCode} — {sc.stageTitle}
                </Text>
                {' · result: '}
                {sc.status}
              </Text>
              {sc.remarks ? <Text>Remarks: {sc.remarks}</Text> : null}
              <Text>Checker: {fmtSigner(sc.signer)}</Text>
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>Test Grades</Text>
        {data.testGrades.length === 0 ? (
          <Text style={styles.para}>No test grades on file.</Text>
        ) : (
          data.testGrades.map((t) => (
            <View key={t.id} style={styles.para} wrap={false}>
              <Text>
                <Text style={styles.headerCell}>
                  {fmtDate(t.recordedAt)} · {t.testKind} ({t.componentKind})
                </Text>
                {t.score != null ? `  score: ${t.score}/${t.maxScore ?? '—'}` : ''}
              </Text>
              {t.remarks ? <Text>Remarks: {t.remarks}</Text> : null}
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>Endorsements Issued</Text>
        {data.endorsements.length === 0 ? (
          <Text style={styles.para}>No endorsements on file.</Text>
        ) : (
          data.endorsements.map((e) => (
            <View key={e.id} style={styles.para} wrap={false}>
              <Text style={styles.headerCell}>
                {fmtDate(e.issuedAt)} · {e.templateCode ?? 'custom'} — {e.templateTitle ?? ''}
              </Text>
              <Text>{e.renderedText}</Text>
              <Text>Signed: {fmtSigner(e.signer)}</Text>
              {e.expiresAt ? <Text>Expires: {fmtDate(e.expiresAt)}</Text> : null}
              {e.revokedAt ? <Text>REVOKED {fmtDate(e.revokedAt)}</Text> : null}
            </View>
          ))
        )}

        {course.completedAt ? (
          <View style={styles.attestation} wrap={false}>
            <Text style={styles.headerCell}>Chief Instructor Attestation</Text>
            <Text style={styles.para}>
              I certify that the student identified above has satisfactorily completed the
              training for {course.courseTitle ?? 'this course'}, meeting the objectives and
              completion standards of course version {course.versionLabel ?? '—'}. Completion
              date: {fmtDate(course.completedAt)}.
            </Text>
            <Text>Signed: {fmtSigner(data.chiefInstructor)}</Text>
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <Text>
            Generated {data.generatedAt} · This export is a true copy of entries sealed on the
            dates shown.
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
