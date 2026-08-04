import { useEffect, useRef, useState } from 'react';
import Select from 'react-select';
import { databaseUrl, jsonHeaders } from '../../config/api.js';
import { getStoredUser } from '../../utils/auth.js';

const empty = {
  firstName: '', lastName: '', dateOfBirth: '', gender: '', contactNumber: '', email: '', password: '',
  emiratesID: '', nationality: '', address: '', bloodType: '', medicalHistory: '', allergies: '', medications: '',
  insuranceProvider: '', policyNumber: '', coverageType: '', clinicID: '', doctors: []
};
const PATIENT_NAME_MAX_LENGTH = 100;
const patientFieldLimits = { firstName: 100, lastName: 100, email: 254, contactNumber: 25, password: 72, emiratesID: 18, nationality: 100, address: 1000, insuranceProvider: 255, policyNumber: 100, coverageType: 100 };

const toForm = (patient, clinicID) => patient ? {
  ...empty, ...patient,
  dateOfBirth: String(patient.dateOfBirth || '').slice(0, 10),
  password: '',
  medicalHistory: (patient.medicalHistory || []).join('\n'),
  allergies: (patient.allergies || []).join('\n'),
  medications: (patient.medications || []).join('\n'),
  insuranceProvider: patient.insuranceDetails?.provider || '',
  policyNumber: patient.insuranceDetails?.policyNumber || '',
  coverageType: patient.insuranceDetails?.coverageType || '',
  doctors: patient.doctors || [],
  clinicID: patient.clinicID || clinicID || ''
} : { ...empty, clinicID: clinicID || '' };

const NewPatientDialog = ({ onClose, onSaved, patient = null }) => {
  const user = getStoredUser();
  const isEditing = Boolean(patient);
  const [form, setForm] = useState(() => toForm(patient, user?.organizationId));
  const [status, setStatus] = useState({ loading: false, error: '' });
  const [clinicDoctors, setClinicDoctors] = useState([]);
  const [clinic, setClinic] = useState(null);
  const [doctorOptionsError, setDoctorOptionsError] = useState('');
  const firstField = useRef(null);
  const dialog = useRef(null);
  const set = (name) => (event) => setForm((value) => ({ ...value, [name]: event.target.value }));

  useEffect(() => {
    firstField.current?.focus();
    const handleKeys = (event) => {
      if (event.key === 'Escape' && !status.loading) onClose();
      if (event.key !== 'Tab' || !dialog.current) return;
      const controls = [...dialog.current.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled])')];
      if (!controls.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKeys);
    return () => document.removeEventListener('keydown', handleKeys);
  }, [onClose, status.loading]);

  useEffect(() => {
    Promise.all(['/clinic/me', '/appointment-options/doctors'].map(async (path) => {
      const response = await fetch(databaseUrl(path), { headers: jsonHeaders() });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || 'Unable to load clinic details');
      return result.data;
    })).then(([clinicDetails, doctors]) => {
      setClinic(clinicDetails);
      setClinicDoctors(doctors || []);
      setForm((value) => ({ ...value, clinicID: clinicDetails.clinicID }));
    }).catch((error) => setDoctorOptionsError(error.message));
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setStatus({ loading: true, error: '' });
    for (const field of ['medicalHistory', 'allergies', 'medications']) {
      const entries = form[field].split('\n').map((value) => value.trim()).filter(Boolean);
      if (entries.length > 50 || entries.some((value) => Array.from(value).length > 500)) {
        setStatus({ loading: false, error: `${field.replace(/([A-Z])/g, ' $1')} allows at most 50 entries and 500 characters per entry.` });
        return;
      }
    }
    const payload = {
      ...form,
      clinicID: Number(form.clinicID),
      medicalHistory: form.medicalHistory.split('\n').map((value) => value.trim()).filter(Boolean),
      allergies: form.allergies.split('\n').map((value) => value.trim()).filter(Boolean),
      medications: form.medications.split('\n').map((value) => value.trim()).filter(Boolean),
      insuranceDetails: { provider: form.insuranceProvider, policyNumber: form.policyNumber, coverageType: form.coverageType },
      doctors: form.doctors
    };
    delete payload.insuranceProvider; delete payload.policyNumber; delete payload.coverageType;
    if (isEditing) { delete payload.password; delete payload.doctors; }
    try {
      const response = await fetch(databaseUrl(isEditing ? `/patients/${encodeURIComponent(patient.patientID)}` : '/patients'), {
        method: isEditing ? 'PUT' : 'POST', headers: jsonHeaders(), body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || `Unable to ${isEditing ? 'update' : 'create'} patient`);
      onSaved?.(result.data);
      onClose();
    } catch (error) { setStatus({ loading: false, error: error.message }); }
  };

  const fields = [
    ['firstName','First name','text'], ['lastName','Last name','text'], ['dateOfBirth','Date of birth','date'],
    ['gender','Gender','text'], ['contactNumber','Contact number','tel'], ['email','Email','email'],
    ...(!isEditing ? [['password','Temporary password','password']] : []),
    ['emiratesID','Emirates ID','text'], ['nationality','Nationality','text'], ['address','Address','text'],
    ['bloodType','Blood type','text'], ['insuranceProvider','Insurance provider','text'], ['policyNumber','Policy number','text'],
    ['coverageType','Coverage type','text']
  ];
  const doctorOptions = clinicDoctors.map((doctor) => ({
    value: doctor.doctorID,
    label: `${doctor.firstName} ${doctor.lastName} — ${doctor.speciality || doctor.specialty || 'Specialty not recorded'} (${doctor.doctorID})`
  }));

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={(event) => event.target === event.currentTarget && !status.loading && onClose()}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="patient-dialog-title" className="max-h-[90vh] w-[68em] max-w-[95vw] overflow-y-auto rounded-xl bg-white p-8 shadow-2xl">
      <form onSubmit={submit} aria-label={isEditing ? 'Edit patient' : 'Add patient'}>
        <div className="flex justify-between gap-4"><h1 id="patient-dialog-title" className="text-3xl font-bold">{isEditing ? 'Edit patient' : 'Add patient'}</h1><button type="button" onClick={onClose} disabled={status.loading} className="rounded-md px-3 py-2 font-semibold hover:bg-gray-100">Close</button></div>
        <p className="my-3 text-sm text-gray-600">Complete profile details are stored securely in the clinical database.</p>
        <p id="patient-name-rule" className="mb-3 text-sm text-gray-600">First and last names may contain valid characters such as hyphens and apostrophes. Maximum 100 characters per field.</p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="text-sm font-medium">Clinic<input readOnly aria-readonly="true" value={clinic ? `${clinic.name} (Clinic ${clinic.clinicID})` : `Clinic ${form.clinicID || 'loading...'}`} className="mt-1 block w-full cursor-not-allowed rounded-md border bg-gray-100 p-2 text-gray-700" /></label>
          {fields.map(([name,label,type], index) => {
            const isName = name === 'firstName' || name === 'lastName';
            const isEmiratesID = name === 'emiratesID';
            const isContact = name === 'contactNumber';
            if (name === 'gender') return <label key={name} className="text-sm font-medium">{label}<select required value={form.gender} onChange={set('gender')} className="mt-1 block w-full rounded-md border p-2"><option value="">Select gender</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option><option value="Prefer not to say">Prefer not to say</option></select></label>;
            if (name === 'bloodType') return <label key={name} className="text-sm font-medium">{label}<select required value={form.bloodType} onChange={set('bloodType')} className="mt-1 block w-full rounded-md border p-2"><option value="">Select blood type</option>{['A+','A-','B+','B-','AB+','AB-','O+','O-'].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>;
            return <label key={name} className="text-sm font-medium">{label}<input ref={index === 0 ? firstField : undefined} required className="mt-1 block w-full rounded-md border p-2" type={type} value={form[name]} onChange={set(name)} maxLength={patientFieldLimits[name]} pattern={isEmiratesID ? '784-[0-9]{4}-[0-9]{7}-[0-9]' : isContact ? '\\+?[0-9][0-9 ()-]{6,24}' : undefined} title={isEmiratesID ? 'Use 784-YYYY-NNNNNNN-C' : isContact ? 'Use 7 to 25 telephone characters' : undefined} aria-describedby={isName ? 'patient-name-rule' : undefined} /></label>;
          })}
          {!isEditing && <fieldset className="rounded-lg border p-3 md:col-span-2 xl:col-span-3">
            <legend className="px-1 text-sm font-semibold">Clinic doctors</legend>
            <label htmlFor="patient-doctors" className="mb-1 block text-sm font-medium">Search and select doctors</label>
            <Select inputId="patient-doctors" isMulti isSearchable options={doctorOptions}
              value={doctorOptions.filter((option) => form.doctors.includes(option.value))}
              onChange={(options) => setForm((value) => ({ ...value, doctors: options.map((option) => option.value) }))}
              placeholder="Search by name, specialty, or doctor ID" noOptionsMessage={() => 'No clinic doctors match your search.'}
              isDisabled={Boolean(doctorOptionsError)} classNamePrefix="patient-doctor-select" />
            {doctorOptionsError && <p role="alert" className="mt-2 text-sm text-red-700">{doctorOptionsError}</p>}
          </fieldset>}
          {isEditing && <p className="rounded-lg border bg-gray-50 p-3 text-sm text-gray-700 md:col-span-2 xl:col-span-3">Doctor assignments are protected and must be changed with the dedicated Assign or Unassign controls.</p>}
          {['medicalHistory','allergies','medications'].map((name) => <label key={name} className="text-sm font-medium capitalize">{name.replace(/([A-Z])/g,' $1')} (maximum 50 entries, 500 characters each)<textarea required maxLength={25049} className="mt-1 block min-h-24 w-full rounded-md border p-2" value={form[name]} onChange={set(name)} /></label>)}
        </div>
        {status.error && <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-red-800">{status.error}</p>}
        <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onClose} disabled={status.loading} className="rounded-md border px-6 py-3 font-semibold">Cancel</button><button disabled={status.loading || !clinic} className="rounded-md bg-[#000834] px-6 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">{status.loading ? 'Saving…' : isEditing ? 'Save changes' : 'Create patient'}</button></div>
      </form>
    </div>
  </div>;
};

export default NewPatientDialog;
