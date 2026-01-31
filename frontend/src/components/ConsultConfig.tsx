import { useState, useEffect } from 'react'

interface ConsultField {
  name: string
  type: string
  label: string
  prompt: string
  required: boolean
}

interface ConsultationConfig {
  config_id: string
  name: string
  description: string
  fields: ConsultField[]
  ai_prompt: string
  voice_name: string
  success_message: string
  emergency_message: string
}

const AVAILABLE_VOICES = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede']
const FIELD_TYPES = ['text', 'number', 'date', 'email', 'phone', 'boolean', 'choice']

function ConsultConfig() {
  const [configs, setConfigs] = useState<ConsultationConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  // Form state
  const [editingConfig, setEditingConfig] = useState<ConsultationConfig | null>(null)
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [aiPrompt, setAiPrompt] = useState('')
  const [voiceName, setVoiceName] = useState('Aoede')
  const [successMessage, setSuccessMessage] = useState('Thank you for completing the consultation!')
  const [emergencyMessage, setEmergencyMessage] = useState('This appears to be an emergency. Please call 911 immediately.')
  const [fields, setFields] = useState<ConsultField[]>([])

  // Load configs
  useEffect(() => {
    fetchConfigs()
  }, [])

  const fetchConfigs = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/admin/consult/configs')
      if (response.ok) {
        const data = await response.json()
        setConfigs(data.configs || [])
      }
    } catch (err) {
      console.error('Error fetching configs:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadDefaultFields = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/admin/consult/default-fields')
      if (response.ok) {
        const data = await response.json()
        setFields(data.fields || [])
      }
    } catch (err) {
      console.error('Error loading default fields:', err)
    }
  }

  const resetForm = () => {
    setEditingConfig(null)
    setFormName('')
    setFormDescription('')
    setAiPrompt("Hello! I'm Dr. MedAssist, your AI medical assistant. I'm here to help gather some information about your health concern today.")
    setVoiceName('Aoede')
    setSuccessMessage('Thank you for completing the consultation!')
    setEmergencyMessage('This appears to be an emergency. Please call 911 immediately.')
    setFields([])
  }

  const editConfig = (config: ConsultationConfig) => {
    setEditingConfig(config)
    setFormName(config.name)
    setFormDescription(config.description)
    setAiPrompt(config.ai_prompt)
    setVoiceName(config.voice_name)
    setSuccessMessage(config.success_message)
    setEmergencyMessage(config.emergency_message)
    setFields(config.fields)
  }

  const addField = () => {
    setFields([...fields, {
      name: '',
      type: 'text',
      label: '',
      prompt: '',
      required: false
    }])
  }

  const updateField = (index: number, updates: Partial<ConsultField>) => {
    setFields(fields.map((f, i) => i === index ? { ...f, ...updates } : f))
  }

  const removeField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index))
  }

  const saveConfig = async () => {
    if (!formName.trim()) {
      setError('Please enter a form name')
      return
    }

    setSaveStatus('saving')
    setError('')

    const configData = {
      name: formName,
      description: formDescription,
      fields: fields.filter(f => f.name.trim()),
      ai_prompt: aiPrompt,
      voice_name: voiceName,
      success_message: successMessage,
      emergency_message: emergencyMessage
    }

    try {
      const url = editingConfig
        ? `http://localhost:8000/api/admin/consult/configs/${editingConfig.config_id}`
        : 'http://localhost:8000/api/admin/consult/configs'

      const response = await fetch(url, {
        method: editingConfig ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configData)
      })

      if (response.ok) {
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 2000)
        fetchConfigs()
        if (!editingConfig) {
          resetForm()
        }
      } else {
        throw new Error('Failed to save')
      }
    } catch (err) {
      setSaveStatus('error')
      setError('Failed to save configuration')
    }
  }

  const deleteConfig = async (configId: string) => {
    if (!confirm('Are you sure you want to delete this configuration?')) return

    try {
      const response = await fetch(`http://localhost:8000/api/admin/consult/configs/${configId}`, {
        method: 'DELETE'
      })
      if (response.ok) {
        fetchConfigs()
        if (editingConfig?.config_id === configId) {
          resetForm()
        }
      }
    } catch (err) {
      setError('Failed to delete configuration')
    }
  }

  const getJsonPreview = () => {
    return JSON.stringify({
      name: formName,
      description: formDescription,
      ai_prompt: aiPrompt,
      voice_name: voiceName,
      fields: fields.filter(f => f.name.trim())
    }, null, 2)
  }

  if (loading) {
    return (
      <div className="config-loading">
        <div className="spinner"></div>
        <p>Loading configurations...</p>
      </div>
    )
  }

  return (
    <div className="consult-config">
      <div className="config-header">
        <h1>Consultation Configuration</h1>
        <p>Create and manage voice consultation templates</p>
      </div>

      {error && <div className="config-error">{error}</div>}

      <div className="config-layout">
        {/* Left Panel - Form Editor */}
        <div className="config-editor">
          <div className="editor-section">
            <h2>{editingConfig ? 'Edit Configuration' : 'Create New Configuration'}</h2>

            <div className="form-group">
              <label>Configuration Name *</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g., Medical Intake Form"
              />
            </div>

            <div className="form-group">
              <label>Description</label>
              <textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Describe what this consultation collects..."
                rows={2}
              />
            </div>

            <div className="form-group">
              <label>AI Greeting Message</label>
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Hello! I'm here to help..."
                rows={2}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Voice</label>
                <select value={voiceName} onChange={(e) => setVoiceName(e.target.value)}>
                  {AVAILABLE_VOICES.map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Success Message</label>
                <input
                  type="text"
                  value={successMessage}
                  onChange={(e) => setSuccessMessage(e.target.value)}
                  placeholder="Thank you!"
                />
              </div>
            </div>
          </div>

          {/* Fields Section */}
          <div className="editor-section">
            <div className="section-header">
              <h3>Consultation Fields</h3>
              <div className="section-actions">
                <button className="btn-secondary" onClick={loadDefaultFields}>
                  Load Defaults
                </button>
                <button className="btn-primary" onClick={addField}>
                  + Add Field
                </button>
              </div>
            </div>

            <div className="fields-list">
              {fields.length === 0 ? (
                <div className="no-fields">
                  <p>No fields added yet. Click "Add Field" or "Load Defaults" to get started.</p>
                </div>
              ) : (
                fields.map((field, index) => (
                  <div key={index} className="field-card">
                    <div className="field-row">
                      <div className="form-group">
                        <label>Field Name</label>
                        <input
                          type="text"
                          value={field.name}
                          onChange={(e) => updateField(index, { name: e.target.value })}
                          placeholder="field_name"
                        />
                      </div>
                      <div className="form-group">
                        <label>Display Label</label>
                        <input
                          type="text"
                          value={field.label}
                          onChange={(e) => updateField(index, { label: e.target.value })}
                          placeholder="Display Label"
                        />
                      </div>
                      <div className="form-group">
                        <label>Type</label>
                        <select
                          value={field.type}
                          onChange={(e) => updateField(index, { type: e.target.value })}
                        >
                          {FIELD_TYPES.map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group checkbox-group">
                        <label>
                          <input
                            type="checkbox"
                            checked={field.required}
                            onChange={(e) => updateField(index, { required: e.target.checked })}
                          />
                          Required
                        </label>
                      </div>
                    </div>
                    <div className="field-row">
                      <div className="form-group full-width">
                        <label>AI Prompt Question</label>
                        <input
                          type="text"
                          value={field.prompt}
                          onChange={(e) => updateField(index, { prompt: e.target.value })}
                          placeholder="What question should the AI ask?"
                        />
                      </div>
                      <button
                        className="btn-danger btn-small"
                        onClick={() => removeField(index)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Save Actions */}
          <div className="editor-actions">
            <button className="btn-secondary" onClick={resetForm}>
              {editingConfig ? 'Cancel Edit' : 'Clear Form'}
            </button>
            <button
              className={`btn-primary ${saveStatus === 'saved' ? 'btn-success' : ''}`}
              onClick={saveConfig}
              disabled={saveStatus === 'saving'}
            >
              {saveStatus === 'idle' && (editingConfig ? 'Update Configuration' : 'Save Configuration')}
              {saveStatus === 'saving' && 'Saving...'}
              {saveStatus === 'saved' && 'Saved!'}
              {saveStatus === 'error' && 'Retry'}
            </button>
          </div>
        </div>

        {/* Right Panel - Preview & Existing Configs */}
        <div className="config-sidebar">
          {/* JSON Preview */}
          <div className="sidebar-section">
            <h3>JSON Preview</h3>
            <pre className="json-preview">{getJsonPreview()}</pre>
          </div>

          {/* Existing Configurations */}
          <div className="sidebar-section">
            <h3>Saved Configurations</h3>
            <div className="configs-list">
              {configs.length === 0 ? (
                <p className="no-configs">No configurations saved yet.</p>
              ) : (
                configs.map(config => (
                  <div
                    key={config.config_id}
                    className={`config-item ${editingConfig?.config_id === config.config_id ? 'active' : ''}`}
                  >
                    <div className="config-item-info">
                      <h4>{config.name}</h4>
                      <p>{config.description || 'No description'}</p>
                      <span className="config-meta">
                        {config.fields.length} fields | Voice: {config.voice_name}
                      </span>
                    </div>
                    <div className="config-item-actions">
                      <button
                        className="btn-small btn-secondary"
                        onClick={() => editConfig(config)}
                      >
                        Edit
                      </button>
                      {config.config_id !== 'default' && (
                        <button
                          className="btn-small btn-danger"
                          onClick={() => deleteConfig(config.config_id)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Field Types Reference */}
          <div className="sidebar-section">
            <h3>Field Types</h3>
            <ul className="field-types-list">
              <li><strong>text</strong> - Free text input</li>
              <li><strong>number</strong> - Numeric values (e.g., severity 1-10)</li>
              <li><strong>date</strong> - Date values</li>
              <li><strong>email</strong> - Email address</li>
              <li><strong>phone</strong> - Phone number</li>
              <li><strong>boolean</strong> - Yes/No questions</li>
              <li><strong>choice</strong> - Multiple choice</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ConsultConfig
