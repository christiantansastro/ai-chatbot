"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
// Update the import path if the Tabs components are located elsewhere, for example:
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { createClientAction } from "@/app/(chat)/actions";

interface ClientFormData {
  // Common fields
  client_name: string;
  client_type: "civil" | "criminal";
  date_of_birth: string;
  address: string;
  phone: string;
  email: string;
  contact_1: string;
  relationship_1: string;
  contact_2: string;
  relationship_2: string;
  notes: string;
  county: string;
  court_date: string;
  quoted: string;
  initial_payment: string;
  due_date_balance: string;

  // Criminal-specific fields
  arrested: boolean;
  arrested_county: string;
  currently_incarcerated: boolean;
  incarceration_location: string;
  incarceration_reason: string;
  last_bond_hearing_date: string;
  last_bond_hearing_location: string;
  date_of_incident: string;
  incident_county: string;
  on_probation: boolean;
  probation_county: string;
  probation_officer: string;
  probation_time_left: string;
  on_parole: boolean;
  parole_officer: string;
  parole_time_left: string;
  arrest_reason: string;
  charges: string;

  // Civil-specific fields
  served_papers_or_initial_filing: string;
  case_type: string;
  other_side_name: string;
  other_side_relation: string;
  other_side_represented_by_attorney: boolean;
  other_side_contact_info: string;
  children_involved: boolean;
  children_details: string;
  previous_court_orders: boolean;
  previous_orders_county: string;
  previous_orders_case_number: string;
}

interface FormErrors {
  [key: string]: string;
}

interface ClientIntakeModalProps {
  children: React.ReactNode;
}

export function ClientIntakeModal({ children }: ClientIntakeModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [formData, setFormData] = useState<ClientFormData>({
    client_name: "",
    client_type: "civil",
    date_of_birth: "",
    address: "",
    phone: "",
    email: "",
    contact_1: "",
    relationship_1: "",
    contact_2: "",
    relationship_2: "",
    notes: "",
    county: "",
    court_date: "",
    quoted: "",
    initial_payment: "",
    due_date_balance: "",
    arrested: false,
    arrested_county: "",
    currently_incarcerated: false,
    incarceration_location: "",
    incarceration_reason: "",
    last_bond_hearing_date: "",
    last_bond_hearing_location: "",
    date_of_incident: "",
    incident_county: "",
    on_probation: false,
    probation_county: "",
    probation_officer: "",
    probation_time_left: "",
    on_parole: false,
    parole_officer: "",
    parole_time_left: "",
    arrest_reason: "",
    charges: "",
    served_papers_or_initial_filing: "",
    case_type: "",
    other_side_name: "",
    other_side_relation: "",
    other_side_represented_by_attorney: false,
    other_side_contact_info: "",
    children_involved: false,
    children_details: "",
    previous_court_orders: false,
    previous_orders_county: "",
    previous_orders_case_number: "",
  });

  const [errors, setErrors] = useState<FormErrors>({});

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // Required fields validation
    if (!formData.client_name.trim()) {
      newErrors.client_name = "Client name is required";
    }

    // Email validation (optional but format check if provided)
    if (formData.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!formData.phone.trim()) {
      newErrors.phone = "Phone number is required";
    }

    // DOB is required for criminal cases, optional for civil
    if (formData.client_type === "criminal" && !formData.date_of_birth.trim()) {
      newErrors.date_of_birth = "Date of birth is required for criminal cases";
    }

    // Validate date formats if provided
    if (formData.date_of_birth && !/^\d{4}-\d{2}-\d{2}$/.test(formData.date_of_birth)) {
      newErrors.date_of_birth = "Please enter date in YYYY-MM-DD format";
    }

    if (formData.court_date && !/^\d{4}-\d{2}-\d{2}$/.test(formData.court_date)) {
      newErrors.court_date = "Please enter date in YYYY-MM-DD format";
    }

    if (formData.due_date_balance && !/^\d{4}-\d{2}-\d{2}$/.test(formData.due_date_balance)) {
      newErrors.due_date_balance = "Please enter date in YYYY-MM-DD format";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: keyof ClientFormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: "" }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setSubmitMessage(null);

    try {
      // Prepare data for submission (exclude empty fields)
      const submissionData: any = {
        client_name: formData.client_name,
        client_type: formData.client_type,
        email: formData.email,
        phone: formData.phone,
      };

      // Add optional fields only if they have values
      if (formData.date_of_birth) submissionData.date_of_birth = formData.date_of_birth;
      if (formData.address) submissionData.address = formData.address;
      if (formData.contact_1) submissionData.contact_1 = formData.contact_1;
      if (formData.relationship_1) submissionData.relationship_1 = formData.relationship_1;
      if (formData.contact_2) submissionData.contact_2 = formData.contact_2;
      if (formData.relationship_2) submissionData.relationship_2 = formData.relationship_2;
      if (formData.notes) submissionData.notes = formData.notes;
      if (formData.county) submissionData.county = formData.county;
      if (formData.court_date) submissionData.court_date = formData.court_date;
      if (formData.quoted) submissionData.quoted = formData.quoted;
      if (formData.initial_payment) submissionData.initial_payment = formData.initial_payment;
      if (formData.due_date_balance) submissionData.due_date_balance = formData.due_date_balance;

      // Add type-specific fields
      if (formData.client_type === "criminal") {
        if (formData.arrested !== undefined) submissionData.arrested = formData.arrested;
        if (formData.arrested_county) submissionData.arrested_county = formData.arrested_county;
        if (formData.currently_incarcerated !== undefined) submissionData.currently_incarcerated = formData.currently_incarcerated;
        if (formData.incarceration_location) submissionData.incarceration_location = formData.incarceration_location;
        if (formData.incarceration_reason) submissionData.incarceration_reason = formData.incarceration_reason;
        if (formData.last_bond_hearing_date) submissionData.last_bond_hearing_date = formData.last_bond_hearing_date;
        if (formData.last_bond_hearing_location) submissionData.last_bond_hearing_location = formData.last_bond_hearing_location;
        if (formData.date_of_incident) submissionData.date_of_incident = formData.date_of_incident;
        if (formData.incident_county) submissionData.incident_county = formData.incident_county;
        if (formData.on_probation !== undefined) submissionData.on_probation = formData.on_probation;
        if (formData.probation_county) submissionData.probation_county = formData.probation_county;
        if (formData.probation_officer) submissionData.probation_officer = formData.probation_officer;
        if (formData.probation_time_left) submissionData.probation_time_left = formData.probation_time_left;
        if (formData.on_parole !== undefined) submissionData.on_parole = formData.on_parole;
        if (formData.parole_officer) submissionData.parole_officer = formData.parole_officer;
        if (formData.parole_time_left) submissionData.parole_time_left = formData.parole_time_left;
        if (formData.arrest_reason) submissionData.arrest_reason = formData.arrest_reason;
        if (formData.charges) submissionData.charges = formData.charges;
      } else if (formData.client_type === "civil") {
        if (formData.other_side_name) submissionData.other_side_name = formData.other_side_name;
        if (formData.other_side_relation) submissionData.other_side_relation = formData.other_side_relation;
        if (formData.other_side_represented_by_attorney !== undefined) submissionData.other_side_represented_by_attorney = formData.other_side_represented_by_attorney;
        if (formData.other_side_contact_info) submissionData.other_side_contact_info = formData.other_side_contact_info;
        if (formData.children_involved !== undefined) submissionData.children_involved = formData.children_involved;
        if (formData.children_details) submissionData.children_details = formData.children_details;
        if (formData.previous_court_orders !== undefined) submissionData.previous_court_orders = formData.previous_court_orders;
        if (formData.previous_orders_county) submissionData.previous_orders_county = formData.previous_orders_county;
        if (formData.previous_orders_case_number) submissionData.previous_orders_case_number = formData.previous_orders_case_number;
        if (formData.served_papers_or_initial_filing) {
          submissionData.served_papers_or_initial_filing = formData.served_papers_or_initial_filing;
        }
        if (formData.case_type) submissionData.case_type = formData.case_type;
      }

      const result = await createClientAction(submissionData);

      if (result.success) {
        setSubmitMessage({ type: "success", text: result.message });
        // Reset form after successful submission
        setTimeout(() => {
          setFormData({
            client_name: "",
            client_type: "civil",
            date_of_birth: "",
            address: "",
            phone: "",
            email: "",
            contact_1: "",
            relationship_1: "",
            contact_2: "",
            relationship_2: "",
            notes: "",
            county: "",
            court_date: "",
            quoted: "",
            initial_payment: "",
            due_date_balance: "",
            arrested: false,
            arrested_county: "",
            currently_incarcerated: false,
            incarceration_location: "",
            incarceration_reason: "",
            last_bond_hearing_date: "",
            last_bond_hearing_location: "",
            date_of_incident: "",
            incident_county: "",
            on_probation: false,
            probation_county: "",
            probation_officer: "",
            probation_time_left: "",
            on_parole: false,
            parole_officer: "",
            parole_time_left: "",
            arrest_reason: "",
            charges: "",
            served_papers_or_initial_filing: "",
            case_type: "",
            other_side_name: "",
            other_side_relation: "",
            other_side_represented_by_attorney: false,
            other_side_contact_info: "",
            children_involved: false,
            children_details: "",
            previous_court_orders: false,
            previous_orders_county: "",
            previous_orders_case_number: "",
          });
          setIsOpen(false);
        }, 2000);
      } else {
        setSubmitMessage({ type: "error", text: result.message });
      }
    } catch (error) {
      setSubmitMessage({
        type: "error",
        text: "An unexpected error occurred. Please try again."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderCommonFields = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="client_name">
            Client Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="client_name"
            value={formData.client_name}
            onChange={(e) => handleInputChange("client_name", e.target.value)}
            className={errors.client_name ? "border-destructive" : ""}
            placeholder="Full legal name"
          />
          {errors.client_name && (
            <p className="text-sm text-destructive mt-1">{errors.client_name}</p>
          )}
        </div>

        <div>
          <Label htmlFor="email">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => handleInputChange("email", e.target.value)}
            className={errors.email ? "border-destructive" : ""}
            placeholder="client@example.com"
          />
          {errors.email && (
            <p className="text-sm text-destructive mt-1">{errors.email}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="phone">
            Phone <span className="text-destructive">*</span>
          </Label>
          <Input
            id="phone"
            value={formData.phone}
            onChange={(e) => handleInputChange("phone", e.target.value)}
            className={errors.phone ? "border-destructive" : ""}
            placeholder="(555) 123-4567"
          />
          {errors.phone && (
            <p className="text-sm text-destructive mt-1">{errors.phone}</p>
          )}
        </div>

        <div>
          <Label htmlFor="date_of_birth">
            Date of Birth {formData.client_type === "criminal" && <span className="text-destructive">*</span>}
          </Label>
          <Input
            id="date_of_birth"
            type="date"
            value={formData.date_of_birth}
            onChange={(e) => handleInputChange("date_of_birth", e.target.value)}
            className={errors.date_of_birth ? "border-destructive" : ""}
          />
          {errors.date_of_birth && (
            <p className="text-sm text-destructive mt-1">{errors.date_of_birth}</p>
          )}
        </div>
      </div>

      <div>
        <Label htmlFor="address">Address</Label>
        <Textarea
          id="address"
          value={formData.address}
          onChange={(e) => handleInputChange("address", e.target.value)}
          placeholder="Full address"
          rows={2}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="contact_1">Emergency Contact 1</Label>
          <Input
            id="contact_1"
            value={formData.contact_1}
            onChange={(e) => handleInputChange("contact_1", e.target.value)}
            placeholder="Contact person's name"
          />
        </div>

        <div>
          <Label htmlFor="relationship_1">Relationship</Label>
          <Input
            id="relationship_1"
            value={formData.relationship_1}
            onChange={(e) => handleInputChange("relationship_1", e.target.value)}
            placeholder="e.g., Spouse, Parent, Friend"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="contact_2">Emergency Contact 2</Label>
          <Input
            id="contact_2"
            value={formData.contact_2}
            onChange={(e) => handleInputChange("contact_2", e.target.value)}
            placeholder="Contact person's name"
          />
        </div>

        <div>
          <Label htmlFor="relationship_2">Relationship</Label>
          <Input
            id="relationship_2"
            value={formData.relationship_2}
            onChange={(e) => handleInputChange("relationship_2", e.target.value)}
            placeholder="e.g., Spouse, Parent, Friend"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="county">County</Label>
        <Input
          id="county"
          value={formData.county}
          onChange={(e) => handleInputChange("county", e.target.value)}
          placeholder="County where legal issues are located"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="court_date">Court Date</Label>
          <Input
            id="court_date"
            type="date"
            value={formData.court_date}
            onChange={(e) => handleInputChange("court_date", e.target.value)}
            className={errors.court_date ? "border-destructive" : ""}
          />
          {errors.court_date && (
            <p className="text-sm text-destructive mt-1">{errors.court_date}</p>
          )}
        </div>

        <div>
          <Label htmlFor="quoted">Quoted Amount</Label>
          <Input
            id="quoted"
            value={formData.quoted}
            onChange={(e) => handleInputChange("quoted", e.target.value)}
            placeholder="e.g., $2500.00"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="initial_payment">Initial Payment</Label>
          <Input
            id="initial_payment"
            value={formData.initial_payment}
            onChange={(e) => handleInputChange("initial_payment", e.target.value)}
            placeholder="e.g., $500.00"
          />
        </div>

        <div>
          <Label htmlFor="due_date_balance">Balance Due Date</Label>
          <Input
            id="due_date_balance"
            type="date"
            value={formData.due_date_balance}
            onChange={(e) => handleInputChange("due_date_balance", e.target.value)}
            className={errors.due_date_balance ? "border-destructive" : ""}
          />
          {errors.due_date_balance && (
            <p className="text-sm text-destructive mt-1">{errors.due_date_balance}</p>
          )}
        </div>
      </div>

      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => handleInputChange("notes", e.target.value)}
          placeholder="Additional notes about the client"
          rows={3}
        />
      </div>
    </div>
  );

  const renderCriminalFields = () => (
    <div className="space-y-4">
      <div>
        <Label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={formData.arrested}
            onChange={(e) => handleInputChange("arrested", e.target.checked)}
            className="rounded"
          />
          Arrested
        </Label>
        {formData.arrested && (
          <div className="mt-2">
            <Label htmlFor="arrested_county">County</Label>
            <Input
              id="arrested_county"
              value={formData.arrested_county}
              onChange={(e) => handleInputChange("arrested_county", e.target.value)}
              placeholder="County where arrested"
            />
          </div>
        )}
      </div>

      <div>
        <Label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={formData.currently_incarcerated}
            onChange={(e) => handleInputChange("currently_incarcerated", e.target.checked)}
            className="rounded"
          />
          Currently Incarcerated
        </Label>
        {formData.currently_incarcerated && (
          <div className="mt-2 space-y-2">
            <div>
              <Label htmlFor="incarceration_location">Where & Why</Label>
              <Input
                id="incarceration_location"
                value={formData.incarceration_location}
                onChange={(e) => handleInputChange("incarceration_location", e.target.value)}
                placeholder="Location and reason for incarceration"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <Label htmlFor="last_bond_hearing_date">Last Bond Hearing Date</Label>
                <Input
                  id="last_bond_hearing_date"
                  type="date"
                  value={formData.last_bond_hearing_date}
                  onChange={(e) => handleInputChange("last_bond_hearing_date", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="last_bond_hearing_location">Location</Label>
                <Input
                  id="last_bond_hearing_location"
                  value={formData.last_bond_hearing_location}
                  onChange={(e) => handleInputChange("last_bond_hearing_location", e.target.value)}
                  placeholder="Where was the bond hearing"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="date_of_incident">Date of Incident</Label>
          <Input
            id="date_of_incident"
            type="date"
            value={formData.date_of_incident}
            onChange={(e) => handleInputChange("date_of_incident", e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="incident_county">County of Incident</Label>
          <Input
            id="incident_county"
            value={formData.incident_county}
            onChange={(e) => handleInputChange("incident_county", e.target.value)}
            placeholder="County where incident occurred"
          />
        </div>
      </div>

      <div>
        <Label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={formData.on_probation}
            onChange={(e) => handleInputChange("on_probation", e.target.checked)}
            className="rounded"
          />
          On Probation
        </Label>
        {formData.on_probation && (
          <div className="mt-2 space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div>
                <Label htmlFor="probation_county">County</Label>
                <Input
                  id="probation_county"
                  value={formData.probation_county}
                  onChange={(e) => handleInputChange("probation_county", e.target.value)}
                  placeholder="County"
                />
              </div>
              <div>
                <Label htmlFor="probation_officer">PO Name</Label>
                <Input
                  id="probation_officer"
                  value={formData.probation_officer}
                  onChange={(e) => handleInputChange("probation_officer", e.target.value)}
                  placeholder="Probation officer"
                />
              </div>
              <div>
                <Label htmlFor="probation_time_left">Time Left</Label>
                <Input
                  id="probation_time_left"
                  value={formData.probation_time_left}
                  onChange={(e) => handleInputChange("probation_time_left", e.target.value)}
                  placeholder="e.g., 2 years"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div>
        <Label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={formData.on_parole}
            onChange={(e) => handleInputChange("on_parole", e.target.checked)}
            className="rounded"
          />
          On Parole
        </Label>
        {formData.on_parole && (
          <div className="mt-2 space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <Label htmlFor="parole_officer">PO Name</Label>
                <Input
                  id="parole_officer"
                  value={formData.parole_officer}
                  onChange={(e) => handleInputChange("parole_officer", e.target.value)}
                  placeholder="Parole officer"
                />
              </div>
              <div>
                <Label htmlFor="parole_time_left">Time Left</Label>
                <Input
                  id="parole_time_left"
                  value={formData.parole_time_left}
                  onChange={(e) => handleInputChange("parole_time_left", e.target.value)}
                  placeholder="e.g., 1 year"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div>
        <Label htmlFor="arrest_reason">What Led to the Arrest</Label>
        <Textarea
          id="arrest_reason"
          value={formData.arrest_reason}
          onChange={(e) => handleInputChange("arrest_reason", e.target.value)}
          placeholder="Description of what led to the arrest"
          rows={3}
        />
      </div>

      <div>
        <Label htmlFor="charges">Charges</Label>
        <Textarea
          id="charges"
          value={formData.charges}
          onChange={(e) => handleInputChange("charges", e.target.value)}
          placeholder="List of criminal charges"
          rows={3}
        />
      </div>
    </div>
  );

  const renderCivilFields = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="other_side_name">Name of Other Side</Label>
          <Input
            id="other_side_name"
            value={formData.other_side_name}
            onChange={(e) => handleInputChange("other_side_name", e.target.value)}
            placeholder="Name of opposing party"
          />
        </div>
        <div>
          <Label htmlFor="other_side_relation">Relation</Label>
          <Input
            id="other_side_relation"
            value={formData.other_side_relation}
            onChange={(e) => handleInputChange("other_side_relation", e.target.value)}
            placeholder="e.g., Spouse, Business partner"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={formData.other_side_represented_by_attorney}
            onChange={(e) => handleInputChange("other_side_represented_by_attorney", e.target.checked)}
            className="rounded"
          />
          Represented by Attorney
        </Label>

        <div>
          <Input
            id="other_side_contact_info"
            value={formData.other_side_contact_info}
            onChange={(e) => handleInputChange("other_side_contact_info", e.target.value)}
            placeholder="Contact info for other side"
            disabled={formData.other_side_represented_by_attorney}
          />
          <p className="text-xs text-muted-foreground mt-1">
            {formData.other_side_represented_by_attorney
              ? "Not needed when represented by attorney"
              : "Contact information for the other side"}
          </p>
        </div>
      </div>

      <div>
        <Label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={formData.children_involved}
            onChange={(e) => handleInputChange("children_involved", e.target.checked)}
            className="rounded"
          />
          Are there kids involved?
        </Label>
        {formData.children_involved && (
          <div className="mt-2">
            <Label htmlFor="children_details">Children Details</Label>
            <Textarea
              id="children_details"
              value={formData.children_details}
              onChange={(e) => handleInputChange("children_details", e.target.value)}
              placeholder="Names, DOBs, and who currently has custody"
              rows={3}
            />
          </div>
        )}
      </div>

      <div>
        <Label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={formData.previous_court_orders}
            onChange={(e) => handleInputChange("previous_court_orders", e.target.checked)}
            className="rounded"
          />
          Are there previous court orders prior to this current action?
        </Label>
        {formData.previous_court_orders && (
          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <Label htmlFor="previous_orders_county">County</Label>
              <Input
                id="previous_orders_county"
                value={formData.previous_orders_county}
                onChange={(e) => handleInputChange("previous_orders_county", e.target.value)}
                placeholder="County"
              />
            </div>
            <div>
              <Label htmlFor="previous_orders_case_number">Case Number</Label>
              <Input
                id="previous_orders_case_number"
                value={formData.previous_orders_case_number}
                onChange={(e) => handleInputChange("previous_orders_case_number", e.target.value)}
                placeholder="Case number"
              />
            </div>
          </div>
        )}
      </div>

      <div>
        <Label htmlFor="served_papers_or_initial_filing">Served Papers or Initial Filing</Label>
        <Textarea
          id="served_papers_or_initial_filing"
          value={formData.served_papers_or_initial_filing}
          onChange={(e) => handleInputChange("served_papers_or_initial_filing", e.target.value)}
          placeholder="Details about papers served or initial filing"
          rows={3}
        />
      </div>

      <div>
        <Label htmlFor="case_type">Case Type</Label>
        <Input
          id="case_type"
          value={formData.case_type}
          onChange={(e) => handleInputChange("case_type", e.target.value)}
          placeholder="e.g., Divorce, Custody, Personal Injury"
        />
      </div>
    </div>
  );

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        {children}
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add New Client</SheetTitle>
          <SheetDescription>
            Enter client information for intake. Fields marked with * are required.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6">
          <Tabs
            value={formData.client_type}
            onValueChange={(value: string) => handleInputChange("client_type", value as "civil" | "criminal")}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="civil">Civil</TabsTrigger>
              <TabsTrigger value="criminal">Criminal</TabsTrigger>
            </TabsList>

            <TabsContent value="civil" className="mt-4">
              <div className="space-y-6">
                {renderCommonFields()}
                {renderCivilFields()}
              </div>
            </TabsContent>

            <TabsContent value="criminal" className="mt-4">
              <div className="space-y-6">
                {renderCommonFields()}
                {renderCriminalFields()}
              </div>
            </TabsContent>
          </Tabs>

          {submitMessage && (
            <div
              className={`mt-4 p-3 rounded-md ${
                submitMessage.type === "success"
                  ? "bg-green-50 text-green-800 border border-green-200"
                  : "bg-red-50 text-red-800 border border-red-200"
              }`}
            >
              {submitMessage.text}
            </div>
          )}

          <div className="flex justify-end gap-2 mt-6">
            <SheetClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </SheetClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating Client..." : "Create Client"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}