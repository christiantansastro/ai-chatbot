import { createServerSupabaseClient } from "@/lib/supabase/server-client";

export interface CreateClientData {
  client_name: string;
  client_type?: string;
  email?: string;
  phone?: string;
  address?: string;
  date_of_birth?: string;
  date_intake?: string;
  contact_1?: string;
  relationship_1?: string;
  contact_2?: string;
  relationship_2?: string;
  notes?: string;
  county?: string;
  arrested?: boolean;
  arrested_county?: string;
  currently_incarcerated?: boolean;
  incarceration_location?: string;
  incarceration_reason?: string;
  last_bond_hearing_date?: string;
  last_bond_hearing_location?: string;
  date_of_incident?: string;
  incident_county?: string;
  on_probation?: boolean;
  probation_county?: string;
  probation_officer?: string;
  probation_time_left?: string;
  on_parole?: boolean;
  parole_officer?: string;
  parole_time_left?: string;
  arrest_reason?: string;
  charges?: string;
  served_papers_or_initial_filing?: string;
  case_type?: string;
  court_date?: string;
  quoted?: string;
  initial_payment?: string;
  due_date_balance?: string;
  payment_method?: string;
  other_side_name?: string;
  other_side_relation?: string;
  other_side_represented_by_attorney?: boolean;
  other_side_contact_info?: string;
  children_involved?: boolean;
  children_details?: string;
  previous_court_orders?: boolean;
  previous_orders_county?: string;
  previous_orders_case_number?: string;
}

export interface CreateClientResult {
  record: any;
  formatted: Record<string, unknown>;
  financial: {
    quoteInserted: boolean;
    paymentInserted: boolean;
    errors: string[];
  };
}

interface CreateClientOptions {
  includeFinancialTransactions?: boolean;
}

const sanitizeCurrency = (value?: string | null): number | null => {
  if (!value?.trim()) {
    return null;
  }

  const numeric = Number(value.replace(/[^0-9.-]+/g, ""));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

export async function createClientRecord(
  clientData: CreateClientData,
  options: CreateClientOptions = { includeFinancialTransactions: true }
): Promise<CreateClientResult> {
  const supabase = createServerSupabaseClient();

  const insertData = {
    client_name: clientData.client_name,
    client_type: clientData.client_type || undefined,
    email: clientData.email || undefined,
    phone: clientData.phone || undefined,
    address: clientData.address || undefined,
    date_of_birth: clientData.date_of_birth || undefined,
    date_intake: clientData.date_intake || undefined,
    contact_1: clientData.contact_1 || undefined,
    relationship_1: clientData.relationship_1 || undefined,
    contact_2: clientData.contact_2 || undefined,
    relationship_2: clientData.relationship_2 || undefined,
    notes: clientData.notes || undefined,
    county: clientData.county || undefined,
    arrested: clientData.arrested ?? undefined,
    arrested_county: clientData.arrested_county || undefined,
    currently_incarcerated: clientData.currently_incarcerated ?? undefined,
    incarceration_location: clientData.incarceration_location || undefined,
    incarceration_reason: clientData.incarceration_reason || undefined,
    last_bond_hearing_date: clientData.last_bond_hearing_date || undefined,
    last_bond_hearing_location: clientData.last_bond_hearing_location || undefined,
    date_of_incident: clientData.date_of_incident || undefined,
    incident_county: clientData.incident_county || undefined,
    on_probation: clientData.on_probation ?? undefined,
    probation_county: clientData.probation_county || undefined,
    probation_officer: clientData.probation_officer || undefined,
    probation_time_left: clientData.probation_time_left || undefined,
    on_parole: clientData.on_parole ?? undefined,
    parole_officer: clientData.parole_officer || undefined,
    parole_time_left: clientData.parole_time_left || undefined,
    arrest_reason: clientData.arrest_reason || undefined,
    charges: clientData.charges || undefined,
    served_papers_or_initial_filing: clientData.served_papers_or_initial_filing || undefined,
    case_type: clientData.case_type || undefined,
    court_date: clientData.court_date || undefined,
    quoted: clientData.quoted || undefined,
    initial_payment: clientData.initial_payment || undefined,
    due_date_balance: clientData.due_date_balance || undefined,
    other_side_name: clientData.other_side_name || undefined,
    other_side_relation: clientData.other_side_relation || undefined,
    other_side_represented_by_attorney: clientData.other_side_represented_by_attorney ?? undefined,
    other_side_contact_info: clientData.other_side_contact_info || undefined,
    children_involved: clientData.children_involved ?? undefined,
    children_details: clientData.children_details || undefined,
    previous_court_orders: clientData.previous_court_orders ?? undefined,
    previous_orders_county: clientData.previous_orders_county || undefined,
    previous_orders_case_number: clientData.previous_orders_case_number || undefined,
  };

  const { data, error } = await supabase
    .from("clients")
    .insert(insertData)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create client: ${error.message}`);
  }

  const financialResult = {
    quoteInserted: false,
    paymentInserted: false,
    errors: [] as string[],
  };

  if (options.includeFinancialTransactions) {
    const quoteAmount = sanitizeCurrency(clientData.quoted);
    const paymentAmount = sanitizeCurrency(clientData.initial_payment);
    const today = new Date().toISOString().split("T")[0];

    if (quoteAmount) {
      const { error: quoteError } = await supabase.from("financials").insert({
        client_id: data.id,
        client_name: data.client_name,
        transaction_type: "quote",
        amount: quoteAmount,
        transaction_date: today,
        payment_due_date: clientData.due_date_balance || null,
        service_description: `Initial consultation and case setup for ${
          data.client_type || "legal"
        } matter`,
        notes: "Automatically created from client intake form",
      });

      if (quoteError) {
        financialResult.errors.push(
          `Failed to create quote transaction: ${quoteError.message}`
        );
      } else {
        financialResult.quoteInserted = true;
      }
    }

    if (paymentAmount) {
      const { error: paymentError } = await supabase.from("financials").insert({
        client_id: data.id,
        client_name: data.client_name,
        transaction_type: "payment",
        amount: paymentAmount,
        payment_method: clientData.payment_method?.trim()
          ? clientData.payment_method
          : "Not specified",
        transaction_date: today,
        service_description: "Initial payment received during intake",
        notes: "Automatically created from client intake form",
      });

      if (paymentError) {
        financialResult.errors.push(
          `Failed to create payment transaction: ${paymentError.message}`
        );
      } else {
        financialResult.paymentInserted = true;
      }
    }
  }

  return {
    record: data,
    formatted: formatClientRecord(data),
    financial: financialResult,
  };
}

export function formatClientRecord(data: any) {
  return {
    id: data.id,
    name: data.client_name,
    clientType: data.client_type || "Not specified",
    email: data.email ? `${data.email} ` : "Not provided",
    phone: data.phone || "Not provided",
    address: data.address || "Not provided",
    dateOfBirth: data.date_of_birth
      ? new Date(data.date_of_birth).toLocaleDateString()
      : "Not provided",
    intakeDate: data.date_intake
      ? new Date(data.date_intake).toLocaleDateString()
      : "Not provided",
    contact1: data.contact_1 || "Not provided",
    relationship1: data.relationship_1 || "Not provided",
    contact2: data.contact_2 || "Not provided",
    relationship2: data.relationship_2 || "Not provided",
    notes: data.notes || "No notes",
    county: data.county || "Not provided",
    arrested:
      data.arrested !== undefined
        ? data.arrested
          ? "Yes"
          : "No"
        : "Not specified",
    arrestedCounty: data.arrested_county || "Not provided",
    currentlyIncarcerated:
      data.currently_incarcerated !== undefined
        ? data.currently_incarcerated
          ? "Yes"
          : "No"
        : "Not specified",
    incarcerationLocation: data.incarceration_location || "Not provided",
    incarcerationReason: data.incarceration_reason || "Not provided",
    lastBondHearingDate: data.last_bond_hearing_date
      ? new Date(data.last_bond_hearing_date).toLocaleDateString()
      : "Not provided",
    lastBondHearingLocation: data.last_bond_hearing_location || "Not provided",
    dateOfIncident: data.date_of_incident
      ? new Date(data.date_of_incident).toLocaleDateString()
      : "Not provided",
    incidentCounty: data.incident_county || "Not provided",
    onProbation:
      data.on_probation !== undefined
        ? data.on_probation
          ? "Yes"
          : "No"
        : "Not specified",
    probationCounty: data.probation_county || "Not provided",
    probationOfficer: data.probation_officer || "Not provided",
    probationTimeLeft: data.probation_time_left || "Not provided",
    onParole:
      data.on_parole !== undefined
        ? data.on_parole
          ? "Yes"
          : "No"
        : "Not specified",
    paroleOfficer: data.parole_officer || "Not provided",
    paroleTimeLeft: data.parole_time_left || "Not provided",
    arrestReason: data.arrest_reason || "Not provided",
    charges: data.charges || "Not provided",
    servedPapersOrInitialFiling:
      data.served_papers_or_initial_filing || "Not provided",
    caseType: data.case_type || "Not provided",
    courtDate: data.court_date
      ? new Date(data.court_date).toLocaleDateString()
      : "Not provided",
    quoted: data.quoted || "Not provided",
    initialPayment: data.initial_payment || "Not provided",
    dueDateBalance: data.due_date_balance
      ? new Date(data.due_date_balance).toLocaleDateString()
      : "Not provided",
    otherSideName: data.other_side_name || "Not provided",
    otherSideRelation: data.other_side_relation || "Not provided",
    otherSideRepresentedByAttorney:
      data.other_side_represented_by_attorney !== undefined
        ? data.other_side_represented_by_attorney
          ? "Yes"
          : "No"
        : "Not specified",
    otherSideContactInfo: data.other_side_contact_info || "Not provided",
    childrenInvolved:
      data.children_involved !== undefined
        ? data.children_involved
          ? "Yes"
          : "No"
        : "Not specified",
    childrenDetails: data.children_details || "Not provided",
    previousCourtOrders:
      data.previous_court_orders !== undefined
        ? data.previous_court_orders
          ? "Yes"
          : "No"
        : "Not specified",
    previousOrdersCounty: data.previous_orders_county || "Not provided",
    previousOrdersCaseNumber:
      data.previous_orders_case_number || "Not provided",
    createdAt: new Date(data.created_at).toLocaleDateString(),
    updatedAt: new Date(data.updated_at).toLocaleDateString(),
    summary: `${data.client_name} (${data.client_type || "Unspecified"}) - ${
      data.email ? `${data.email} ` : "No email"
    } (${data.phone || "No phone"})`,
  };
}
