// Database rows -> the camelCase objects the API returns.

export function profileOut(p) {
  return {
    id: p.id,
    email: p.email,
    fullName: p.full_name,
    phone: p.phone,
    gender: p.gender,
    dob: p.dob_text,
    participantType: p.participant_type,
    affiliation: p.affiliation,
    orgName: p.org_name,
    orgAddress: p.org_address,
    educationLevel: p.education_level,
    degree: p.degree,
    branch: p.branch,
    yearOfStudy: p.year_of_study,
    graduationYear: p.graduation_year,
    cgpa: p.cgpa == null ? null : Number(p.cgpa),
    vitCampus: p.vit_campus,
    vitRegNo: p.vit_reg_no,
    vitEmail: p.vit_email,
    residence: p.residence,
    hostelBlock: p.hostel_block,
    hostelRoom: p.hostel_room,
    specialRequirements: p.special_requirements,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

export function submissionOut(s) {
  return s && {
    title: s.title,
    abstract: s.abstract,
    repoUrl: s.repo_url,
    demoUrl: s.demo_url,
    documentUrl: s.document_url,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  };
}
