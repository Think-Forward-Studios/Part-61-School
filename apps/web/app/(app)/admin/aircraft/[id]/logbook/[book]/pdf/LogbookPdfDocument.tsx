/**
 * LogbookPdfDocument — @react-pdf/renderer component for MNT-10 logbook
 * PDF exports. Rendered to a stream by export.pdf/route.ts.
 *
 * NO banned terms in any static string. Labels use "certify / compliant /
 * current / authorized" vocabulary.
 */
import React from 'react';
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

export type LogbookPdfEntry = {
  id: string;
  entryDate: string; // YYYY-MM-DD
  description: string;
  hobbs: string | null;
  tach: string | null;
  airframeTime: string | null;
  engineTime: string | null;
  sealed: boolean;
  signer: {
    fullName: string;
    certificateType: string;
    certificateNumber: string;
  } | null;
};

export type LogbookPdfProps = {
  aircraft: {
    tailNumber: string;
    make: string | null;
    model: string | null;
    year: number | null;
    serialNumber?: string | null;
  };
  book: 'airframe' | 'engine' | 'prop';
  currentTotals: {
    hobbs: string | null;
    tach: string | null;
    airframe: string | null;
  };
  entries: LogbookPdfEntry[];
  generatedAt: string; // ISO
};

const styles = StyleSheet.create({
  page: {
    padding: 28,
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
  title: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
  },
  subtitle: {
    fontSize: 9,
    marginTop: 2,
  },
  totals: {
    fontSize: 9,
    marginTop: 2,
  },
  table: {
    flexDirection: 'column',
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#999',
    paddingVertical: 3,
  },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    paddingVertical: 3,
    backgroundColor: '#eee',
  },
  cellDate: { width: '11%' },
  cellDesc: { width: '44%', paddingRight: 4 },
  cellHobbs: { width: '8%', textAlign: 'right' },
  cellTach: { width: '8%', textAlign: 'right' },
  cellAF: { width: '9%', textAlign: 'right' },
  cellSigner: { width: '20%', paddingLeft: 4 },
  headerCell: { fontFamily: 'Helvetica-Bold' },
  draftTag: {
    color: '#b45309',
    fontFamily: 'Helvetica-Bold',
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

function bookTitle(book: LogbookPdfProps['book']): string {
  switch (book) {
    case 'airframe':
      return 'Airframe Logbook';
    case 'engine':
      return 'Engine Logbook';
    case 'prop':
      return 'Propeller Logbook';
  }
}

function fmtNum(x: string | null): string {
  if (x == null || x === '') return '—';
  const n = Number(x);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(1);
}

function fmtSigner(e: LogbookPdfEntry): string {
  if (!e.sealed) return 'DRAFT';
  if (!e.signer) return '—';
  return `${e.signer.fullName}, ${e.signer.certificateType.toUpperCase()} ${e.signer.certificateNumber}`;
}

export function LogbookPdfDocument(props: LogbookPdfProps) {
  const { aircraft, book, currentTotals, entries, generatedAt } = props;
  const headerLine2 = [
    aircraft.make,
    aircraft.model,
    aircraft.year ? `(${aircraft.year})` : null,
    aircraft.serialNumber ? `S/N ${aircraft.serialNumber}` : null,
  ]
    .filter(Boolean)
    .join(' ');
  const totalsLine = `Current totals — Hobbs ${fmtNum(currentTotals.hobbs)} · Tach ${fmtNum(currentTotals.tach)} · Airframe ${fmtNum(currentTotals.airframe)}`;
  const disclaimer =
    'This export is a true copy of entries sealed on the dates shown. Certified under the authority of the signer(s) of record.';

  return (
    <Document title={`${aircraft.tailNumber} ${bookTitle(book)}`} author="Part 61 School CAMP">
      <Page size="LETTER" style={styles.page} wrap>
        <View style={styles.header} fixed>
          <Text style={styles.title}>
            {aircraft.tailNumber} — {bookTitle(book)}
          </Text>
          {headerLine2 ? <Text style={styles.subtitle}>{headerLine2}</Text> : null}
          <Text style={styles.totals}>{totalsLine}</Text>
        </View>

        <View style={styles.table}>
          <View style={styles.headerRow} fixed>
            <Text style={[styles.cellDate, styles.headerCell]}>Date</Text>
            <Text style={[styles.cellDesc, styles.headerCell]}>Description</Text>
            <Text style={[styles.cellHobbs, styles.headerCell]}>Hobbs</Text>
            <Text style={[styles.cellTach, styles.headerCell]}>Tach</Text>
            <Text style={[styles.cellAF, styles.headerCell]}>Airframe</Text>
            <Text style={[styles.cellSigner, styles.headerCell]}>Signer</Text>
          </View>
          {entries.length === 0 ? (
            <View style={styles.row}>
              <Text style={{ width: '100%', fontStyle: 'italic' }}>
                No entries have been sealed in this book yet.
              </Text>
            </View>
          ) : (
            entries.map((e) => (
              <View key={e.id} style={styles.row} wrap={false}>
                <Text style={styles.cellDate}>{e.entryDate}</Text>
                <Text style={styles.cellDesc}>{e.description}</Text>
                <Text style={styles.cellHobbs}>{fmtNum(e.hobbs)}</Text>
                <Text style={styles.cellTach}>{fmtNum(e.tach)}</Text>
                <Text style={styles.cellAF}>{fmtNum(e.airframeTime)}</Text>
                <Text style={[styles.cellSigner, !e.sealed ? styles.draftTag : {}]}>
                  {fmtSigner(e)}
                </Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.footer} fixed>
          <Text>
            Generated {generatedAt} · {disclaimer}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
