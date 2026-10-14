import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import 'bootstrap/dist/css/bootstrap.min.css';
import '../styles/QuizHome.css';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Modal, Button, Form } from 'react-bootstrap';
import { supabase } from "../supabaseClient.js";
// Using logo from public directory
const logo = '/logo.jpg';
import { FiCheckCircle } from "react-icons/fi";
import { FaEye, FaEyeSlash } from 'react-icons/fa';

const QuizHome = () => {
  const [name, setName] = useState('');
  const [newClass, setNewClass] = useState('');
  const [currentTerm, setCurrentTerm] = useState('');
  const [newSex, setNewSex] = useState('');
  const [profilePic, setProfilePic] = useState(null);
  const [filterSubject, setFilterSubject] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [filterTerm, setFilterTerm] = useState('');
  const [filterPurpose, setFilterPurpose] = useState(''); // Filter by exam type
  const [showArchived, setShowArchived] = useState(false); // Toggle archived items
  const [studentsOptions, setStudentsOptions] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [sessionType, setSessionType] = useState('objective'); // Session type selector
  // const [showModal, setShowModal] = useState(true); // Modal removed as per request
  const [adminPassword, setAdminPassword] = useState(''); // Initialize without a default value
  // const [inputPassword, setInputPassword] = useState('');
  // const [showPassword, setShowPassword] = useState(false); // State to manage password visibility

  const router = useRouter();

  useEffect(() => {
    const fetchAdminPassword = async () => {
      try {
        const { data, error } = await supabase
          .from('bluebell_settings')
          .select('cbtPassword');
        if (error) throw error;
        // Use the first row if data exists, otherwise default to empty string
        setAdminPassword(data && data.length > 0 ? data[0].cbtPassword : "");
      } catch (error) {
        toast.error('Error fetching admin password: ' + error.message);
      }
    }
    fetchAdminPassword();
  }, []);

  useEffect(() => {
    const fetchStudents = async () => {
      try {
        const { data, error } = await supabase
          .from('bluebell_student') // Assuming 'students' is the table name
          .select('name, class, passport'); // Adjust the field names as necessary
        if (error) throw error;
        const sortedStudents = data.map(student => ({ name: student.name, class: student.class }));
        setStudentsOptions(sortedStudents); // Set student names and classes
      } catch (error) {
        toast.error('Error fetching students: ' + error.message);
      }
    }
    fetchStudents();
  }, []);

  useEffect(() => {
    const fetchProfilePic = async () => {
      // Find matching student case-insensitively to ensure correct casing for DB query
      const matchedStudent = studentsOptions.find(s => 
        s.name.toLowerCase() === name.toLowerCase().trim() && 
        s.class.toLowerCase().replace(/\s+/g, '') === newClass.toLowerCase().replace(/\s+/g, '')
      );

      const searchName = matchedStudent ? matchedStudent.name : name;
      const searchClass = matchedStudent ? matchedStudent.class : newClass;

      if (searchName && searchClass) {
        try {
          const { data, error } = await supabase
            .from('bluebell_student')
            .select('passport')
            .eq('name', searchName)
            .eq('class', searchClass)
            .single();
          if (error) throw error;
          if (data) {
            setProfilePic(data.passport);
          }
        } catch (error) {
          // Only show error if we really tried to fetch
          console.error("Error fetching profile pic:", error);
          // toast.error('Student Details is incorrect, check student details'); 
          // Commented out toast to avoid spamming while typing. 
          // The visual feedback (profile pic appearing or not) + Start Exam button state is enough?
          // Original code had toast.
          if (matchedStudent) { 
             // If we found a match locally but DB fetch failed, that's a real error worth showing
             toast.error('Error loading profile picture');
          }
        }
      }
    }
    fetchProfilePic();
  }, [name, newClass, studentsOptions]);

  useEffect(() => {
    const fetchSubjects = async () => {
      try {
        // Determine table based on session type
        let tableName = 'bluebell_cbtQuestions';
        if (sessionType === 'completion') tableName = 'bluebell_cbt_completion';
        else if (sessionType === 'essay') tableName = 'bluebell_cbt_essay';

        const allColumns = 'subject, class, duration, questions, image, purpose, term, maxScore, created_at, updated_at';

        let result = await supabase.from(tableName).select(allColumns);
        if (result.error && /maxScore/i.test(result.error.message || '')) {
          // The declared-marks column is optional until bluebell_cbt_max_score.sql has
          // been run: the list must still load, defaulting to one mark per question
          result = await supabase.from(tableName).select(allColumns.replace(', maxScore', ''));
        }

        const { data, error } = result;
        if (error) throw error;
        const formattedSubjects = data.map(subject => ({
          name: subject.subject,
          image: subject.image,
          class: subject.class,
          duration: subject.duration,
          purpose: subject.purpose || 'practice',
          term: subject.term || '',
          questions: subject.questions.length,
          // Marks the paper is worth: what the teacher declared, else one mark per
          // question. The student can then see the true maximum before starting.
          maxScore: Number(subject.maxScore) > 0 ? Number(subject.maxScore) : subject.questions.length,
          created_at: subject.created_at || new Date().toISOString(),
          updated_at: subject.updated_at || subject.created_at || new Date().toISOString(),
        }));
        setSubjects(formattedSubjects);
      } catch (error) {
        toast.error('Error fetching subjects: ' + error.message);
      }
    }
    fetchSubjects();
  }, [sessionType]); // Refetch when session type changes

  // useEffect(() => {
  //   setFilterClass(newClass);
  // }, [newClass]);

  // const handlePasswordSubmit = () => {
  //   if (inputPassword === adminPassword) {
  //     setShowModal(false);
  //     toast.success('Access granted');
  //   } else {
  //     toast.error('Incorrect password. Please try again.');
  //   }
  // };

  const handleStartExam = (subject, duration, purpose, maxScore) => {
    // Find matching student to ensure correct casing
    const matchedStudent = studentsOptions.find(s => 
      s.name.toLowerCase() === name.toLowerCase().trim() && 
      s.class.toLowerCase().replace(/\s+/g, '') === newClass.toLowerCase().replace(/\s+/g, '')
    );
    
    const validName = matchedStudent ? matchedStudent.name : name;
    const validClass = matchedStudent ? matchedStudent.class : newClass;

    // Also normalize term if possible
    const matchedTerm = currentTermOptions.find(t => t.toLowerCase() === currentTerm.toLowerCase().trim());
    const validTerm = matchedTerm || currentTerm;

    const queryParams = new URLSearchParams({
      name: validName,
      newClass: validClass,
      currentTerm: validTerm,
      newSex,
      subject,
      duration,
      purpose,
      // Display only: the exam screen always re-reads the paper from the server
      // before it works out any mark
      ...(maxScore ? { maxScore } : {}),
      sessionType
    }).toString();
    router.push(`/exam?${queryParams}`);
  };

  const classOptions = [
    ...Array.from({ length: 1 }, (_, i) => `Creche`),
    ...Array.from({ length: 2 }, (_, i) => `PreNursery${i + 1}`),
    ...Array.from({ length: 2 }, (_, i) => `Nursery ${i + 1}`),
    ...Array.from({ length: 12 }, (_, i) => `Year ${i + 1}`),
  ];

  const sexOptions = ['Male', 'Female'];

  const currentTermOptions = ['First Term', 'Second Term', 'Third Term'];

  const formItems = [
    { type: 'studentsdropdown', label: 'NAME', placeholder: 'Select Student Name', value: name, setValue: setName, option: studentsOptions.map(student => student.name) },
    { type: 'termdropdown', label: 'CURRENT TERM', placeholder: 'Select Current Term', value: currentTerm, setValue: setCurrentTerm, option: currentTermOptions },
    { type: 'dropdown', label: 'CLASS', value: newClass, setValue: setNewClass, placeholder: 'Select Student Class', option: classOptions },
    { type: 'sexDropdown', label: 'GENDER', value: newSex, setValue: setNewSex, placeholder: 'Select Student Gender', option: sexOptions }
  ];

  const filteredSubjects = subjects.filter(
    (subject) => {
      const subjectNameMatch = subject.name.toLowerCase().replace(/\s+/g, '').includes(filterSubject.toLowerCase().replace(/\s+/g, ''));
      const classMatch = filterClass === '' || subject.class.toLowerCase().replace(/\s+/g, '') === filterClass.toLowerCase().replace(/\s+/g, '');
      const termMatch = filterTerm === '' || (subject.term && subject.term.toLowerCase().replace(/\s+/g, '') === filterTerm.toLowerCase().replace(/\s+/g, ''));
      
      // Handle purpose filter - treat 'midterm' and 'test' as the same
      let purposeMatch = true;
      if (filterPurpose !== '') {
        if (filterPurpose === 'midterm') {
          // Match both 'midterm' and 'test' purposes
          purposeMatch = subject.purpose === 'midterm' || subject.purpose === 'test';
        } else {
          purposeMatch = subject.purpose === filterPurpose;
        }
      }
      
      // Calculate if exam is archived (older than 2 months) - using updated_at
      const updatedDate = new Date(subject.updated_at);
      const twoMonthsAgo = new Date();
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
      const isArchived = updatedDate < twoMonthsAgo;
      
      // Show/hide based on archive toggle
      if (showArchived) {
        return subjectNameMatch && classMatch && termMatch && purposeMatch && isArchived;
      } else {
        return subjectNameMatch && classMatch && termMatch && purposeMatch && !isArchived;
      }
    }
  );
  
  // Count archived items for display
  const archivedCount = subjects.filter(subject => {
    const updatedDate = new Date(subject.updated_at);
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    return updatedDate < twoMonthsAgo;
  }).length;

  const imgUrl = 'https://BLUEBELL_SUPABASE_REF_PLACEHOLDER.supabase.co/storage/v1/object/public/passport/';
  const subjectImage = 'https://BLUEBELL_SUPABASE_REF_PLACEHOLDER.supabase.co/storage/v1/object/public/cbt/';

  const formatDuration = (duration) => {
    if (duration < 60) {
      return `${duration} minutes`;
    } else {
      const hours = Math.floor(duration / 60);
      const minutes = duration % 60;
      return `${hours} hour${hours > 1 ? 's' : ''} ${minutes > 0 ? `${minutes} minutes` : ''}`;
    }
  };

  const handleBlur = (value, setValue, options) => {
    if (!value || !options) return;
    const match = options.find(opt => opt.toLowerCase() === value.toLowerCase().trim());
    if (match) {
      setValue(match);
    }
  };

  const studentExists = studentsOptions.some(student => 
    student.name.toLowerCase() === name.toLowerCase().trim() && 
    student.class.toLowerCase().replace(/\s+/g, '') === newClass.toLowerCase().replace(/\s+/g, '')
  );
  const isStartExamDisabled = !name || !newClass || !currentTerm || !newSex || !studentExists;

  return (
    <div className="container m-5 p-5">
      <ToastContainer />
      {/* <Modal className='passwordModal' show={showModal} onHide={() => setShowModal(false)} backdrop="static" keyboard={false}>
        <Modal.Header>
          <Modal.Title>Admin Access Required</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group controlId="formBasicPassword">
              <Form.Label>Enter Admin Password</Form.Label>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <Form.Control
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={inputPassword}
                  onChange={(e) => setInputPassword(e.target.value)}
                />
                <Button
                  variant="secondary"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ marginLeft: '10px' }}
                >
                  {showPassword ? <FaEyeSlash /> : <FaEye />}
                </Button>
              </div>
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="primary" onClick={handlePasswordSubmit}>
            Submit
          </Button>
        </Modal.Footer>
      </Modal> */}
      {/* {!showModal && ( */}
        <div>
          <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: 'var(--container-bg, #f8f9fa)', marginBottom: '40px', padding: '20px', borderRadius: '15px', boxShadow: '0 4px 8px var(--shadow-color, rgba(0, 0, 0, 0.1))'}}>
            <img src={logo} alt="logo" style={{height: '130px', width: '130px'}} />
            <h1 className="text-center decorated-title" style={{color: 'gray'}}>Welcome to Bluebell International School CBT Exam Portal</h1>
          </div>
          <div className="row mb-4">
            <div className="col-md-6">
              {formItems.map((item, index) => (
                <div className="form-group mb-4 shadow-input" key={index}>
                  <label htmlFor={`input-${index}`} className="form-label elegant-label">{item.label}</label>
                  <input
                    type={item.mainType}
                    list={`options-${index}`}
                    id={`input-${index}`}
                    className="form-control elegant-input"
                    placeholder={item.placeholder}
                    value={item.value}
                    onChange={(e) => item.setValue(e.target.value)}
                    onBlur={() => handleBlur(item.value, item.setValue, item.option)}
                  />
                  <datalist id={`options-${index}`}>
                    {item.option &&
                      item.option.map((op, idx) => <option key={idx} value={op} />)}
                  </datalist>
                </div>
              ))}
              <div className="form-group">
                <label htmlFor="profilePic">Profile Picture</label>
                {profilePic && <img src={`${imgUrl}${profilePic}`} alt="Profile" className="img-thumbnail mt-2" style={{ width: '150px', height: '150px' }} />}
              </div>
            </div>
            <div className="col-md-6">
              <div className="instructions">
                <h4>Instructions</h4>
                <ul>
                  <li>Ensure you have a stable internet connection.</li>
                  <li>Read each question carefully before answering.</li>
                  <li>You have a limited time to complete the exam.</li>
                  <li>Click the "Start Exam" button to begin the exam.</li>
                  <li>Do not exist your exam screen until the exam is over.</li>
                </ul>
              </div>
            </div>
          </div>

          <h4 className="mb-3">
            {showArchived ? '📦 Archived Exams & Tests' : 'Select Subject'}
          </h4>
          {showArchived && (
            <div style={{ 
              backgroundColor: '#fff3cd', 
              border: '1px solid #ffc107', 
              borderRadius: '8px', 
              padding: '10px 15px', 
              marginBottom: '15px',
              color: '#856404'
            }}>
              ℹ️ You are viewing archived exams (older than 2 months). Click "Show Current Exams" to return to active exams.
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '10px' }}>
            <p className="text-muted mb-0">Showing {filteredSubjects.length} subject{filteredSubjects.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="row mb-4">
            <div className="col-md-3">
              <input
                type="text"
                className="form-control filter-input"
                placeholder="Filter by Subject"
                value={filterSubject}
                onChange={(e) => setFilterSubject(e.target.value)}
              />
            </div>
            <div className="col-md-3">
              <select
                className="form-control filter-input"
                value={filterClass}
                onChange={(e) => setFilterClass(e.target.value)}
              >
                <option value="">All Classes</option>
                {classOptions.map((cls, idx) => (
                  <option key={idx} value={cls}>{cls}</option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <select
                className="form-control filter-input"
                value={filterTerm}
                onChange={(e) => setFilterTerm(e.target.value)}
              >
                <option value="">All Terms</option>
                <option value="First Term">First Term</option>
                <option value="Second Term">Second Term</option>
                <option value="Third Term">Third Term</option>
              </select>
            </div>
            <div className="col-md-4">
              <select
                className="form-control filter-input"
                value={filterPurpose}
                onChange={(e) => setFilterPurpose(e.target.value)}
              >
                <option value="">All Types</option>
                <option value="exam">📝 Exam</option>
                <option value="midterm">📋 Midterm Test</option>
                <option value="practice">📖 Practice</option>
              </select>
            </div>
          </div>
          
          {/* Session Type Selector */}
          <div className="row mb-3">
            <div className="col-md-12">
              <label><strong>Session Type:</strong></label>
              <select
                className="form-control filter-input"
                value={sessionType}
                onChange={(e) => setSessionType(e.target.value)}
              >
                <option value="objective">📝 Objective (Multiple Choice)</option>
                <option value="completion">✍️ Completion (Fill-in-the-Blank)</option>
                <option value="essay">📄 Essay (Free Text)</option>
              </select>
            </div>
          </div>
          
          <div className="row">
            {filteredSubjects.map((subject, index) => {
              // Generate a color based on the subject name
              const getColorFromName = (name) => {
                const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
                let hash = 0;
                for (let i = 0; i < name.length; i++) {
                  hash = name.charCodeAt(i) + ((hash << 5) - hash);
                }
                return colors[Math.abs(hash) % colors.length];
              };
              
              // Check if this exam is archived - using updated_at (2 months threshold)
              const updatedDate = new Date(subject.updated_at);
              const twoMonthsAgo = new Date();
              twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
              const isArchived = updatedDate < twoMonthsAgo;
              
              return (
              <div className="col-md-4 mb-4" key={index}>
                <div className="card itemInput" style={{ position: 'relative' }} title={isArchived ? 'Archived Exam' : ''}>
                  {/* Archive badge */}
                  {isArchived && showArchived && (
                    <div style={{
                      position: 'absolute',
                      top: '10px',
                      right: '10px',
                      backgroundColor: '#6c757d',
                      color: 'white',
                      padding: '4px 10px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: '600',
                      zIndex: 10
                    }}>
                      📦 Archived
                    </div>
                  )}
                  {subject.image ? (
                    <img src={`${subjectImage}${subject.image}`} className="card-img-top" alt={subject.name} />
                  ) : (
                    <div 
                      className="card-img-top d-flex align-items-center justify-content-center"
                      style={{
                        height: '200px',
                        background: `linear-gradient(135deg, ${getColorFromName(subject.name)} 0%, ${getColorFromName(subject.name + 'shade')} 100%)`,
                        color: 'white',
                        fontSize: '24px',
                        fontWeight: 'bold',
                        textAlign: 'center',
                        padding: '20px'
                      }}
                    >
                      {subject.name}
                    </div>
                  )}
                  <div className="card-body">
                    <h5 className="card-title">{subject.name}</h5>
                    <p className="card-text"><span className='text-primary' style={{fontWeight: '600'}}>Class: </span>{subject.class}</p>
                    <p className="card-text"><span className='text-primary' style={{fontWeight: '600'}}>Duration: </span>{formatDuration(subject.duration)}</p>
                    <p className="card-text"><span className='text-primary' style={{ fontWeight: '600' }}>Questions: </span>{subject.questions} questions · max {subject.maxScore} marks</p>
                    <p className="card-text"><span className='text-primary' style={{ fontWeight: '600' }}>Type: </span>{(subject.purpose === 'midterm' || subject.purpose === 'test') ? 'Mid-term Test' : subject.purpose === 'exam' ? 'Exam' : 'Practice'}</p>
                    <div className='flex d-flex align-self-center gap-3'>
                    <button onClick={() => handleStartExam(subject.name, subject.duration, subject.purpose, subject.maxScore)} className="btn btn-primary" disabled={isStartExamDisabled}>
                      Start Exam
                      </button>
                      <div style={{gap: '8px', display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
                    <p className='text-success my-auto'>Success</p>
                    <span className='text-success'><FiCheckCircle /></span>
                    </div>
                    </div>
                  </div>
                </div>
              </div>
            )})}
          </div>
        </div>
      {/* )} */}
    </div>
  )
}

export default QuizHome;