import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica' },
  title: { fontSize: 16, marginBottom: 4 },
  subtitle: { fontSize: 9, color: '#666', marginBottom: 16 },
  table: { width: '100%' },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    paddingBottom: 4,
    marginBottom: 4,
  },
  headerCell: { fontFamily: 'Helvetica-Bold', fontSize: 8, flex: 1 },
  row: {
    flexDirection: 'row',
    paddingVertical: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
  },
  cell: { fontSize: 8, flex: 1 },
  footer: { marginTop: 20, fontSize: 7, color: '#999', textAlign: 'center' },
  empty: { marginTop: 20, fontSize: 10, color: '#999', textAlign: 'center' },
});

interface Column {
  key: string;
  label: string;
  format?: (v: unknown) => string;
}

interface Props {
  title: string;
  filtersApplied: string;
  columns: Column[];
  rows: Array<Record<string, unknown>>;
}

export function ReportPdfShell({ title, filtersApplied, columns, rows }: Props) {
  const now = new Date().toISOString().slice(0, 10);
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>
          {filtersApplied} · Generated {now}
        </Text>
        {rows.length === 0 ? (
          <Text style={styles.empty}>No data for the selected filters.</Text>
        ) : (
          <View style={styles.table}>
            <View style={styles.headerRow}>
              {columns.map((c) => (
                <Text key={c.key} style={styles.headerCell}>
                  {c.label}
                </Text>
              ))}
            </View>
            {rows.map((row, i) => (
              <View key={i} style={styles.row}>
                {columns.map((c) => {
                  const val = row[c.key];
                  const display = c.format ? c.format(val) : String(val ?? '');
                  return (
                    <Text key={c.key} style={styles.cell}>
                      {display}
                    </Text>
                  );
                })}
              </View>
            ))}
          </View>
        )}
        <Text style={styles.footer}>Part 61 School · {title}</Text>
      </Page>
    </Document>
  );
}
