import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from "@react-pdf/renderer";
import type { RdoCompleto, ObraComSupervisor } from "@/lib/diario";
import {
  CONDICAO_LABEL,
  PRIORIDADE_LABEL,
  TIPO_VISITA_LABEL,
  agruparPorAmbiente,
  formatDataBR,
  formatIntervalo,
  nowRecife,
  periodoTexto,
  rdosOrdenadosDescendente,
  totalFotos,
} from "./utils";

const COLORS = {
  black: "#141412",
  graphite: "#41423E",
  taupe: "#D6D1CC",
  taupeLight: "#EFEBE6",
  offwhite: "#F7F8F4",
  danger: "#8C3A2E",
  warn: "#A07B3F",
  success: "#4A5D43",
  muted: "#6E6E68",
};

export const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 36,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: COLORS.black,
    lineHeight: 1.4,
  },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 9,
    color: COLORS.graphite,
  },
  // Capa
  capaLogo: { height: 40, marginBottom: 18, objectFit: "contain", alignSelf: "flex-start" },
  capaTitulo: {
    fontFamily: "Helvetica-Bold",
    fontSize: 28,
    color: COLORS.black,
    marginBottom: 10,
  },
  capaSubtitulo: { fontSize: 13, color: COLORS.graphite, marginBottom: 28 },
  metaWrap: { flexDirection: "row", flexWrap: "wrap", marginTop: 8 },
  metaCol: { width: "50%", marginBottom: 14, paddingRight: 8 },
  metaLabel: { fontSize: 9, color: COLORS.graphite, textTransform: "uppercase" },
  metaValue: { fontSize: 12, color: COLORS.black, marginTop: 2 },
  divider: { height: 1, backgroundColor: COLORS.taupe, marginTop: 18, marginBottom: 12 },
  capaExportadoEm: { fontSize: 9, color: COLORS.graphite },
  // RDO
  rdoHeader: { marginBottom: 8 },
  rdoTitleRow: { flexDirection: "row", alignItems: "baseline", marginBottom: 4 },
  rdoId: { fontSize: 10, color: COLORS.graphite, marginRight: 8, fontFamily: "Courier" },
  rdoData: { fontSize: 14, fontFamily: "Helvetica-Bold", color: COLORS.black },
  rdoHora: { fontSize: 10, color: COLORS.graphite, marginLeft: 8 },
  rdoResponsavel: {
    fontSize: 9,
    color: COLORS.graphite,
    fontFamily: "Courier",
    marginTop: 4,
    marginBottom: 2,
  },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 6 },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 8,
    marginRight: 4,
    marginBottom: 3,
    borderRadius: 2,
  },
  // sections
  sectionLabel: {
    fontSize: 9,
    color: COLORS.graphite,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
    marginTop: 10,
  },
  paragraph: { fontSize: 10, color: COLORS.black, marginBottom: 4 },
  bullet: { flexDirection: "row", marginBottom: 2 },
  bulletDot: { width: 8, fontSize: 10 },
  // ambiente
  ambienteBloco: {
    marginTop: 18,
    paddingHorizontal: 10,
    paddingBottom: 6,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.taupe,
  },
  ambienteHeader: {
    backgroundColor: COLORS.taupeLight,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 8,
    marginLeft: -10,
    marginRight: -10,
  },
  ambienteTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", color: COLORS.black },
  // fotos
  fotoGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  fotoCell: { width: "50%", padding: 3 },
  fotoImg: { width: "100%", height: 160, objectFit: "cover", borderRadius: 2 },
  fotoLegenda: { fontSize: 8, color: COLORS.graphite, marginTop: 2 },
  // assinatura
  assinaturaImg: { maxWidth: 300, height: 80, objectFit: "contain", marginTop: 6 },
  assinaturaTexto: { fontSize: 9, color: COLORS.graphite, marginTop: 4 },
  rdoSeparator: { height: 1, backgroundColor: COLORS.taupe, marginTop: 16, marginBottom: 4 },
});

function badgeStyle(kind: "tipo" | "cond" | "prio", value: string) {
  const map: Record<string, { bg: string; fg: string }> = {
    medicao: { bg: "#E6E4DF", fg: "#41423E" },
    supervisao_montagem: { bg: "#E8ECE4", fg: "#4A5D43" },
    praticavel: { bg: "#E8ECE4", fg: "#4A5D43" },
    parcialmente_praticavel: { bg: "#F1E9DA", fg: "#A07B3F" },
    impraticavel: { bg: "#F1DDD8", fg: "#8C3A2E" },
    alta: { bg: "#F1DDD8", fg: "#8C3A2E" },
    media: { bg: "#F1E9DA", fg: "#A07B3F" },
    baixa: { bg: "#E6E4DF", fg: "#41423E" },
  };
  void kind;
  return map[value] ?? { bg: "#E6E4DF", fg: "#41423E" };
}

function Badge({ kind, value, label }: { kind: "tipo" | "cond" | "prio"; value: string; label: string }) {
  const s = badgeStyle(kind, value);
  return (
    <Text style={[styles.badge, { backgroundColor: s.bg, color: s.fg }]}>{label.toUpperCase()}</Text>
  );
}

export type CapaProps = {
  obra: ObraComSupervisor;
  rdos: RdoCompleto[];
  escopo: "diario" | "rdo";
  rdoUnico?: RdoCompleto;
  logoDataUrl?: string | null;
};

export function Capa({ obra, rdos, escopo, rdoUnico, logoDataUrl }: CapaProps) {
  const titulo = escopo === "diario" ? "Diário de Obra" : "Relatório de Visita";
  const subtitulo = escopo === "diario" ? "Relatório Diário de Obra" : `RDO ${rdoUnico?.id ?? ""}`;
  return (
    <View>
      {logoDataUrl ? <Image src={logoDataUrl} style={styles.capaLogo} /> : null}
      <Text style={styles.capaTitulo}>{titulo}</Text>
      <Text style={styles.capaSubtitulo}>{subtitulo}</Text>
      <View style={styles.metaWrap}>
        <View style={styles.metaCol}>
          <Text style={styles.metaLabel}>Cliente</Text>
          <Text style={styles.metaValue}>{obra.nome_cliente}</Text>
        </View>
        <View style={styles.metaCol}>
          <Text style={styles.metaLabel}>Endereço</Text>
          <Text style={styles.metaValue}>{obra.endereco}</Text>
        </View>
        <View style={styles.metaCol}>
          <Text style={styles.metaLabel}>Supervisor padrão</Text>
          <Text style={styles.metaValue}>{obra.supervisor?.nome ?? "—"}</Text>
        </View>
        <View style={styles.metaCol}>
          <Text style={styles.metaLabel}>{escopo === "diario" ? "Período" : "Data"}</Text>
          <Text style={styles.metaValue}>
            {escopo === "diario"
              ? periodoTexto(rdos)
              : rdoUnico
                ? `${formatDataBR(rdoUnico.data)} · ${formatIntervalo(rdoUnico.hora_chegada, rdoUnico.hora_saida)}`
                : "—"}
          </Text>
        </View>
        <View style={styles.metaCol}>
          <Text style={styles.metaLabel}>{escopo === "diario" ? "Total de RDOs" : "Responsável"}</Text>
          <Text style={styles.metaValue}>
            {escopo === "diario" ? rdos.length : (rdoUnico?.supervisor?.nome ?? "—")}
          </Text>
        </View>
        <View style={styles.metaCol}>
          <Text style={styles.metaLabel}>Total de fotos</Text>
          <Text style={styles.metaValue}>{totalFotos(rdos)}</Text>
        </View>
      </View>
      <View style={styles.divider} />
      <Text style={styles.capaFooter}>Exportado em {nowRecife()}</Text>
    </View>
  );
}

export function RodapePagina({ obra }: { obra: ObraComSupervisor }) {
  return (
    <View style={styles.footer} fixed>
      <Text>NUE Projetos — {obra.nome_cliente}</Text>
      <Text
        render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
      />
    </View>
  );
}

export type RdoBlocoProps = {
  rdo: RdoCompleto;
  fotosCache: Map<string, string>;
  variant?: "completo" | "detalhado" | "sem-fotos";
};

export function RdoBloco({ rdo, fotosCache, variant = "completo" }: RdoBlocoProps) {
  const { grupos, fotosSemAmbiente, pendGerais, pontosGerais } = agruparPorAmbiente(rdo);
  const horario = formatIntervalo(rdo.hora_chegada, rdo.hora_saida);

  return (
    <View>
      <View style={styles.rdoHeader}>
        <View style={styles.rdoTitleRow}>
          <Text style={styles.rdoId}>{rdo.id}</Text>
          <Text style={styles.rdoData}>{formatDataBR(rdo.data)}</Text>
          <Text style={styles.rdoHora}>{horario}</Text>
        </View>
        <View style={styles.badgeRow}>
          <Badge kind="tipo" value={rdo.tipo_visita} label={TIPO_VISITA_LABEL[rdo.tipo_visita] ?? rdo.tipo_visita} />
          <Badge kind="cond" value={rdo.condicao_local} label={CONDICAO_LABEL[rdo.condicao_local] ?? rdo.condicao_local} />
          {rdo.supervisor && (
            <Text style={[styles.badge, { backgroundColor: COLORS.taupeLight, color: COLORS.black }]}>
              {rdo.supervisor.nome.toUpperCase()}
            </Text>
          )}
          {!rdo.finalizado && (
            <Text style={[styles.badge, { backgroundColor: "#E6E4DF", color: COLORS.muted }]}>
              RASCUNHO
            </Text>
          )}
        </View>
      </View>

      {rdo.registros.trim() !== "" && (
        <View>
          <Text style={styles.sectionLabel}>Registros do dia</Text>
          <Text style={styles.paragraph}>{rdo.registros}</Text>
        </View>
      )}

      {rdo.proximos_passos.trim() !== "" && (
        <View>
          <Text style={styles.sectionLabel}>Próximos passos</Text>
          <Text style={styles.paragraph}>{rdo.proximos_passos}</Text>
        </View>
      )}

      {rdo.equipe_nue.length > 0 && (
        <View>
          <Text style={styles.sectionLabel}>Equipe NUE</Text>
          <Text style={styles.paragraph}>
            {rdo.equipe_nue
              .map((e) => (e.funcao ? `${e.nome} (${e.funcao})` : e.nome))
              .join(", ")}
          </Text>
        </View>
      )}

      {rdo.terceiros.length > 0 && (
        <View>
          <Text style={styles.sectionLabel}>Terceiros</Text>
          <Text style={styles.paragraph}>
            {rdo.terceiros
              .map((t) => (t.papel ? `${t.nome} (${t.papel})` : t.nome))
              .join(", ")}
          </Text>
        </View>
      )}

      {pendGerais.length > 0 && (
        <View>
          <Text style={styles.sectionLabel}>Pendências gerais</Text>
          {pendGerais.map((p) => (
            <View key={p.id} style={styles.bullet}>
              <Badge kind="prio" value={p.prioridade} label={PRIORIDADE_LABEL[p.prioridade] ?? p.prioridade} />
              <Text style={[styles.paragraph, { flex: 1, marginBottom: 2 }]}>{p.descricao}</Text>
            </View>
          ))}
        </View>
      )}

      {pontosGerais.length > 0 && (
        <View>
          <Text style={styles.sectionLabel}>Pontos de atenção gerais</Text>
          {pontosGerais.map((p) => (
            <View key={p.id} style={styles.bullet}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={[styles.paragraph, { flex: 1, marginBottom: 2 }]}>{p.descricao}</Text>
            </View>
          ))}
        </View>
      )}

      {grupos.map((g) => {
        const obs = (rdo.observacoes_ambiente.find((o) => o.ambiente_id === g.id)?.texto ?? "").trim();
        return (
          <View key={g.id} wrap={variant !== "detalhado"}>
            <View style={styles.ambienteHeader}>
              <Text style={styles.ambienteTitle}>Ambiente: {g.nome}</Text>
            </View>
            {obs !== "" && <Text style={styles.paragraph}>{obs}</Text>}
            {g.pendencias.length > 0 && (
              <View>
                <Text style={styles.sectionLabel}>Pendências</Text>
                {g.pendencias.map((p) => (
                  <View key={p.id} style={styles.bullet}>
                    <Badge
                      kind="prio"
                      value={p.prioridade}
                      label={PRIORIDADE_LABEL[p.prioridade] ?? p.prioridade}
                    />
                    <Text style={[styles.paragraph, { flex: 1, marginBottom: 2 }]}>{p.descricao}</Text>
                  </View>
                ))}
              </View>
            )}
            {g.pontos.length > 0 && (
              <View>
                <Text style={styles.sectionLabel}>Pontos de atenção</Text>
                {g.pontos.map((p) => (
                  <View key={p.id} style={styles.bullet}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={[styles.paragraph, { flex: 1, marginBottom: 2 }]}>{p.descricao}</Text>
                  </View>
                ))}
              </View>
            )}
            {g.fotos.length > 0 && variant === "completo" && (
              <View style={styles.fotoGrid}>
                {g.fotos.map((f) => {
                  const data = fotosCache.get(f.url);
                  if (!data) return null;
                  return (
                    <View key={f.id} style={styles.fotoCell}>
                      <Image src={data} style={styles.fotoImg} />
                      {f.legenda && <Text style={styles.fotoLegenda}>{f.legenda}</Text>}
                    </View>
                  );
                })}
              </View>
            )}
            {g.fotos.length > 0 && variant === "detalhado" &&
              g.fotos.map((f) => {
                const data = fotosCache.get(f.url);
                if (!data) return null;
                return (
                  <View key={f.id} break>
                    <Image
                      src={data}
                      style={{ width: "100%", height: 520, objectFit: "contain" }}
                    />
                    <Text
                      style={{
                        fontSize: 11,
                        textAlign: "center",
                        marginTop: 8,
                        color: COLORS.black,
                        fontFamily: "Helvetica-Bold",
                      }}
                    >
                      {f.legenda || "(sem legenda)"}
                    </Text>
                  </View>
                );
              })}
            {g.fotos.length > 0 && variant === "sem-fotos" && (
              <View>
                <Text style={styles.sectionLabel}>Fotos do ambiente</Text>
                {g.fotos.map((f, i) => (
                  <Text key={f.id} style={styles.paragraph}>
                    {i + 1}. {f.legenda || "(sem legenda)"}
                  </Text>
                ))}
              </View>
            )}
          </View>
        );
      })}

      {fotosSemAmbiente.length > 0 && (
        <View>
          <View style={styles.ambienteHeader}>
            <Text style={styles.ambienteTitle}>Fotos sem ambiente</Text>
          </View>
          {variant === "completo" && (
            <View style={styles.fotoGrid}>
              {fotosSemAmbiente.map((f) => {
                const data = fotosCache.get(f.url);
                if (!data) return null;
                return (
                  <View key={f.id} style={styles.fotoCell}>
                    <Image src={data} style={styles.fotoImg} />
                    {f.legenda && <Text style={styles.fotoLegenda}>{f.legenda}</Text>}
                  </View>
                );
              })}
            </View>
          )}
          {variant === "detalhado" &&
            fotosSemAmbiente.map((f) => {
              const data = fotosCache.get(f.url);
              if (!data) return null;
              return (
                <View key={f.id} break>
                  <Image src={data} style={{ width: "100%", height: 520, objectFit: "contain" }} />
                  <Text
                    style={{
                      fontSize: 11,
                      textAlign: "center",
                      marginTop: 8,
                      fontFamily: "Helvetica-Bold",
                    }}
                  >
                    {f.legenda || "(sem legenda)"}
                  </Text>
                </View>
              );
            })}
          {variant === "sem-fotos" &&
            fotosSemAmbiente.map((f, i) => (
              <Text key={f.id} style={styles.paragraph}>
                {i + 1}. {f.legenda || "(sem legenda)"}
              </Text>
            ))}
        </View>
      )}

      {rdo.assinatura_url && (
        <View>
          <Text style={styles.sectionLabel}>Assinatura</Text>
          {fotosCache.get(rdo.assinatura_url) ? (
            <Image src={fotosCache.get(rdo.assinatura_url)!} style={styles.assinaturaImg} />
          ) : null}
          <Text style={styles.assinaturaTexto}>
            Assinada por {rdo.supervisor?.nome ?? "—"}
          </Text>
        </View>
      )}
    </View>
  );
}

export type DocumentoProps = {
  obra: ObraComSupervisor;
  rdos: RdoCompleto[];
  escopo: "diario" | "rdo";
  rdoUnico?: RdoCompleto;
  fotosCache: Map<string, string>;
  logoDataUrl?: string | null;
  variant?: "completo" | "detalhado" | "sem-fotos";
};

export function DocumentoPdf({
  obra,
  rdos,
  escopo,
  rdoUnico,
  fotosCache,
  logoDataUrl,
  variant = "completo",
}: DocumentoProps) {
  const lista = escopo === "rdo" && rdoUnico ? [rdoUnico] : rdosOrdenadosDescendente(rdos);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Capa obra={obra} rdos={rdos} escopo={escopo} rdoUnico={rdoUnico} logoDataUrl={logoDataUrl} />
        <RodapePagina obra={obra} />
      </Page>
      {variant === "detalhado" ? (
        lista.map((rdo) => (
          <Page key={rdo.id} size="A4" style={styles.page}>
            <RdoBloco rdo={rdo} fotosCache={fotosCache} variant={variant} />
            <RodapePagina obra={obra} />
          </Page>
        ))
      ) : (
        <Page size="A4" style={styles.page}>
          {lista.map((rdo, i) => (
            <View key={rdo.id} break={i > 0}>
              <RdoBloco rdo={rdo} fotosCache={fotosCache} variant={variant} />
            </View>
          ))}
          <RodapePagina obra={obra} />
        </Page>
      )}
    </Document>
  );
}
