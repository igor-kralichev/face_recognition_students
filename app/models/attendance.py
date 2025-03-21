from app import db

class Attendance(db.Model):
    __tablename__ = 'attendance'
    id = db.Column(db.Integer, primary_key=True)
    timestamp = db.Column(db.TIMESTAMP(timezone=True), nullable=False)
    id_teacher = db.Column(db.Integer, db.ForeignKey('teachers.id', ondelete='CASCADE'), nullable=False)
    id_student = db.Column(db.Integer, db.ForeignKey('students.id', ondelete='CASCADE'), nullable=True)
    id_group = db.Column(db.Integer, db.ForeignKey('groups.id', ondelete='CASCADE'), nullable=False)
    teacher = db.relationship('Teacher', backref=db.backref('attendances', cascade='all, delete-orphan'))
    student = db.relationship('Student', backref=db.backref('attendances', cascade='all, delete-orphan'))
    group = db.relationship('Group', backref=db.backref('attendances', cascade='all, delete-orphan'))