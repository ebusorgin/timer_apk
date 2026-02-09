import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ApiService } from '../../services/api.service';

interface Stats {
  students: number;
  enrollments: number;
  programs: number;
  popularPrograms: { id: string; title: string; slug: string; count: number }[];
}

interface Lesson {
  n: number;
  topic: string;
  description?: string;
  conclusions?: string;
  result?: string;
}

interface Program {
  id: string;
  title: string;
  slug: string;
  description: string;
  ageMin: number;
  ageMax: number;
  durationWeeks: number;
  lessonsPerWeek?: number;
  format?: string;
  schoolType?: string;
  imageUrl?: string | null;
  price?: number | null;
  schedule?: string | null;
  curriculum?: Lesson[];
}

interface SchoolType {
  id: string;
  title: string;
  description?: string;
  sortOrder?: number;
}

interface Student {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface Enrollment {
  id: string;
  studentName: string;
  studentEmail: string;
  programTitle: string;
  programId: string;
  groupId?: string | null;
  groupTitle?: string;
  groupSchedule?: string;
  status: string;
  progress?: number;
  enrolledAt: number;
}

interface Group {
  id: string;
  programId: string;
  programTitle: string;
  title: string;
  schedule: string;
  maxStudents: number;
}

interface Homework {
  id: string;
  groupId: string;
  lessonN: number;
  title: string;
  description: string;
  dueAt?: number | null;
}

@Component({
  selector: 'school-admin',
  standalone: true,
  imports: [FormsModule, TranslateModule, RouterLink],
  template: `
    <div class="container page">
      <h1>{{ 'admin.title' | translate }}</h1>
      <div class="tabs">
        <button [class.active]="tab() === 'stats'" (click)="tab.set('stats')">{{ 'admin.tabStats' | translate }}</button>
        <button [class.active]="tab() === 'programs'" (click)="tab.set('programs'); loadPrograms(); loadSchoolTypes()">{{ 'admin.tabPrograms' | translate }}</button>
        <button [class.active]="tab() === 'groups'" (click)="tab.set('groups'); loadGroups(); loadPrograms()">{{ 'admin.tabGroups' | translate }}</button>
        <button [class.active]="tab() === 'schoolTypes'" (click)="tab.set('schoolTypes'); loadSchoolTypes()">{{ 'admin.tabSchoolTypes' | translate }}</button>
        <button [class.active]="tab() === 'students'" (click)="tab.set('students'); loadStudents()">{{ 'admin.tabStudents' | translate }}</button>
        <button [class.active]="tab() === 'enrollments'" (click)="tab.set('enrollments'); loadEnrollments(); loadGroups()">{{ 'admin.tabEnrollments' | translate }}</button>
      </div>

      @if (tab() === 'stats') {
        @if (loadingStats()) {
          <div class="loading-skeleton">
            <div class="stats-grid">
              <div class="stat-card skeleton"></div>
              <div class="stat-card skeleton"></div>
              <div class="stat-card skeleton"></div>
            </div>
            <p class="loading-text">{{ 'admin.loading' | translate }}</p>
          </div>
        } @else {
          @if (stats(); as s) {
            <div class="stats-grid">
              <div class="stat-card"><span class="num">{{ s.students }}</span><span>{{ 'admin.students' | translate }}</span></div>
              <div class="stat-card"><span class="num">{{ s.enrollments }}</span><span>{{ 'admin.enrollments' | translate }}</span></div>
              <div class="stat-card"><span class="num">{{ s.programs }}</span><span>{{ 'admin.programs' | translate }}</span></div>
            </div>
            <h3>{{ 'admin.popularPrograms' | translate }}</h3>
            @if (s.popularPrograms.length === 0) {
              <p class="empty-state">{{ 'admin.noPopularPrograms' | translate }}</p>
            } @else {
              <div class="popular-grid">
                @for (p of s.popularPrograms; track p.id) {
                  <a [routerLink]="['/programs', p.id]" class="popular-card">
                    <strong>{{ p.title }}</strong>
                    <span class="popular-count">{{ p.count }} {{ 'admin.enrollments' | translate }}</span>
                  </a>
                }
              </div>
            }
          }
        }
      }

      @if (tab() === 'programs') {
        <div class="programs-toolbar">
          <select (change)="onProgramFilter($event)">
            <option value="">{{ 'admin.allSchoolTypes' | translate }}</option>
            @for (st of schoolTypes(); track st.id) {
              <option [value]="st.id">{{ st.title }}</option>
            }
          </select>
          <button (click)="openProgramForm()" class="btn-add">{{ 'admin.addProgram' | translate }}</button>
        </div>
        @if (loadingPrograms()) {
          <p class="loading-text">{{ 'admin.loading' | translate }}</p>
        } @else if (filteredPrograms().length === 0) {
          <div class="empty-state">
            <p>{{ 'admin.noPrograms' | translate }}</p>
            <button (click)="openProgramForm()" class="btn-add">{{ 'admin.addProgram' | translate }}</button>
          </div>
        } @else {
          <div class="grouped-list">
            @for (st of schoolTypes(); track st.id) {
              <div class="school-type-group">
                <div class="group-header">
                  <h3>{{ st.title }}</h3>
                  <button (click)="openProgramForm({schoolType: st.id})" class="btn-add-inline">+ {{ 'admin.addProgram' | translate }}</button>
                </div>
                <div class="list">
                  @let stPrograms = getProgramsBySchoolType(st.id);
                  @if (stPrograms.length === 0) {
                    <p class="empty-msg">{{ 'admin.noPrograms' | translate }}</p>
                  }
                  @for (p of stPrograms; track p.id) {
                    <div class="row">
                      <div class="row-content">
                        @if (p.imageUrl) {
                          <img [src]="p.imageUrl" [alt]="p.title" class="row-thumb" />
                        }
                        <div class="row-info">
                          <strong>{{ p.title }}</strong>
                          <span class="age">{{ p.ageMin }}–{{ p.ageMax }} {{ 'programs.years' | translate }}</span>
                          <span class="groups-count" (click)="tab.set('groups'); loadGroups(); groupFilterProgram.set(p.id)">
                            {{ getGroupsCount(p.id) }} {{ 'admin.tabGroups' | translate }}
                          </span>
                        </div>
                      </div>
                      <div class="row-actions">
                        <button (click)="editProgram(p)">{{ 'admin.edit' | translate }}</button>
                        <button (click)="deleteProgram(p)" class="btn-danger">{{ 'admin.delete' | translate }}</button>
                      </div>
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        }
        @if (showProgramForm()) {
          <div class="modal-overlay" (click)="closeProgramForm()">
            <div class="modal modal-program" (click)="$event.stopPropagation()">
              <div class="modal-header">
                <h3>{{ (editingProgram() ? 'admin.editProgram' : 'admin.newProgram') | translate }}</h3>
                <button type="button" class="modal-close" (click)="closeProgramForm()" aria-label="Close">×</button>
              </div>
              <div class="modal-body">
              @if (errorMessage()) {
                <div class="form-error">{{ errorMessage() }}</div>
              }
              @if (successMessage()) {
                <div class="form-success">{{ successMessage() }}</div>
              }
              <form (ngSubmit)="saveProgram()">
                <div class="form-tabs">
                  <button type="button" [class.active]="programFormLang() === 'ru'" (click)="programFormLang.set('ru')">RU</button>
                  <button type="button" [class.active]="programFormLang() === 'sr'" (click)="programFormLang.set('sr')">SR</button>
                  <button type="button" [class.active]="programFormLang() === 'en'" (click)="programFormLang.set('en')">EN</button>
                </div>
                <div class="form-section">
                  @if (programFormLang() === 'ru') {
                    <label class="form-label">{{ 'admin.programTitle' | translate }} (RU)</label>
                    <input [(ngModel)]="programForm.titleRu" name="titleRu" required class="form-input" />
                    <label class="form-label">{{ 'admin.description' | translate }} (RU)</label>
                    <textarea [(ngModel)]="programForm.descriptionRu" name="descRu" rows="5" class="form-input form-textarea" [placeholder]="'admin.descriptionPlaceholder' | translate"></textarea>
                    <label class="form-label">{{ 'admin.curriculum' | translate }} (RU)</label>
                    <div class="curriculum-list">
                      @for (lesson of programForm.curriculumRu; track $index) {
                        <div class="lesson-editor">
                          <div class="lesson-header">
                            <span class="lesson-num">{{ 'admin.lessonNum' | translate }} {{ lesson.n }}</span>
                            <button type="button" (click)="removeLesson('ru', $index)" class="btn-remove">{{ 'admin.removeLesson' | translate }}</button>
                          </div>
                          <label class="form-label">{{ 'admin.lessonTopic' | translate }}</label>
                          <input [(ngModel)]="lesson.topic" [name]="'ru_topic_' + $index" class="form-input" />
                          <label class="form-label">{{ 'admin.lessonDescription' | translate }}</label>
                          <textarea [(ngModel)]="lesson.description" [name]="'ru_desc_' + $index" class="form-input form-textarea" rows="2"></textarea>
                          <label class="form-label">{{ 'admin.lessonConclusions' | translate }}</label>
                          <input [(ngModel)]="lesson.conclusions" [name]="'ru_conc_' + $index" class="form-input" />
                          <label class="form-label">{{ 'admin.lessonResult' | translate }}</label>
                          <input [(ngModel)]="lesson.result" [name]="'ru_res_' + $index" class="form-input" />
                        </div>
                      }
                      <button type="button" (click)="addLesson('ru')" class="btn-add-lesson">{{ 'admin.addLesson' | translate }}</button>
                    </div>
                  }
                  @if (programFormLang() === 'sr') {
                    <label class="form-label">{{ 'admin.programTitle' | translate }} (SR)</label>
                    <input [(ngModel)]="programForm.titleSr" name="titleSr" class="form-input" />
                    <label class="form-label">{{ 'admin.description' | translate }} (SR)</label>
                    <textarea [(ngModel)]="programForm.descriptionSr" name="descSr" rows="5" class="form-input form-textarea" [placeholder]="'admin.descriptionPlaceholder' | translate"></textarea>
                    <label class="form-label">{{ 'admin.curriculum' | translate }} (SR)</label>
                    <div class="curriculum-list">
                      @for (lesson of programForm.curriculumSr; track $index) {
                        <div class="lesson-editor">
                          <div class="lesson-header">
                            <span class="lesson-num">{{ 'admin.lessonNum' | translate }} {{ lesson.n }}</span>
                            <button type="button" (click)="removeLesson('sr', $index)" class="btn-remove">{{ 'admin.removeLesson' | translate }}</button>
                          </div>
                          <label class="form-label">{{ 'admin.lessonTopic' | translate }}</label>
                          <input [(ngModel)]="lesson.topic" [name]="'sr_topic_' + $index" class="form-input" />
                          <label class="form-label">{{ 'admin.lessonDescription' | translate }}</label>
                          <textarea [(ngModel)]="lesson.description" [name]="'sr_desc_' + $index" class="form-input form-textarea" rows="2"></textarea>
                          <label class="form-label">{{ 'admin.lessonConclusions' | translate }}</label>
                          <input [(ngModel)]="lesson.conclusions" [name]="'sr_conc_' + $index" class="form-input" />
                          <label class="form-label">{{ 'admin.lessonResult' | translate }}</label>
                          <input [(ngModel)]="lesson.result" [name]="'sr_res_' + $index" class="form-input" />
                        </div>
                      }
                      <button type="button" (click)="addLesson('sr')" class="btn-add-lesson">{{ 'admin.addLesson' | translate }}</button>
                    </div>
                  }
                  @if (programFormLang() === 'en') {
                    <label class="form-label">{{ 'admin.programTitle' | translate }} (EN)</label>
                    <input [(ngModel)]="programForm.titleEn" name="titleEn" class="form-input" />
                    <label class="form-label">{{ 'admin.description' | translate }} (EN)</label>
                    <textarea [(ngModel)]="programForm.descriptionEn" name="descEn" rows="5" class="form-input form-textarea" [placeholder]="'admin.descriptionPlaceholder' | translate"></textarea>
                    <label class="form-label">{{ 'admin.curriculum' | translate }} (EN)</label>
                    <div class="curriculum-list">
                      @for (lesson of programForm.curriculumEn; track $index) {
                        <div class="lesson-editor">
                          <div class="lesson-header">
                            <span class="lesson-num">{{ 'admin.lessonNum' | translate }} {{ lesson.n }}</span>
                            <button type="button" (click)="removeLesson('en', $index)" class="btn-remove">{{ 'admin.removeLesson' | translate }}</button>
                          </div>
                          <label class="form-label">{{ 'admin.lessonTopic' | translate }}</label>
                          <input [(ngModel)]="lesson.topic" [name]="'en_topic_' + $index" class="form-input" />
                          <label class="form-label">{{ 'admin.lessonDescription' | translate }}</label>
                          <textarea [(ngModel)]="lesson.description" [name]="'en_desc_' + $index" class="form-input form-textarea" rows="2"></textarea>
                          <label class="form-label">{{ 'admin.lessonConclusions' | translate }}</label>
                          <input [(ngModel)]="lesson.conclusions" [name]="'en_conc_' + $index" class="form-input" />
                          <label class="form-label">{{ 'admin.lessonResult' | translate }}</label>
                          <input [(ngModel)]="lesson.result" [name]="'en_res_' + $index" class="form-input" />
                        </div>
                      }
                      <button type="button" (click)="addLesson('en')" class="btn-add-lesson">{{ 'admin.addLesson' | translate }}</button>
                    </div>
                  }
                </div>
                <hr class="form-divider" />
                <div class="form-section form-section-params">
                  <div class="form-row">
                    <label class="form-label">{{ 'admin.slug' | translate }}</label>
                    <input [(ngModel)]="programForm.slug" name="slug" class="form-input" />
                  </div>
                  <div class="form-row form-row-inline">
                    <div class="form-field">
                      <label class="form-label">{{ 'admin.ageFrom' | translate }}</label>
                      <input type="number" [(ngModel)]="programForm.ageMin" name="ageMin" min="5" max="18" class="form-input form-input-sm" />
                    </div>
                    <div class="form-field">
                      <label class="form-label">{{ 'admin.ageTo' | translate }}</label>
                      <input type="number" [(ngModel)]="programForm.ageMax" name="ageMax" min="5" max="18" class="form-input form-input-sm" />
                    </div>
                  </div>
                  <div class="form-row">
                    <label class="form-label">{{ 'admin.schoolType' | translate }}</label>
                    <select [(ngModel)]="programForm.schoolType" name="schoolType" class="form-input">
                      @for (st of schoolTypes(); track st.id) {
                        <option [value]="st.id">{{ st.title }}</option>
                      }
                    </select>
                  </div>
                  <div class="form-row form-row-inline">
                    <div class="form-field">
                      <label class="form-label">{{ 'admin.weeks' | translate }}</label>
                      <input type="number" [(ngModel)]="programForm.durationWeeks" name="weeks" min="1" class="form-input form-input-sm" />
                    </div>
                    <div class="form-field">
                      <label class="form-label">{{ 'admin.lessonsPerWeek' | translate }}</label>
                      <input type="number" [(ngModel)]="programForm.lessonsPerWeek" name="lessonsPerWeek" min="1" max="7" class="form-input form-input-sm" />
                    </div>
                  </div>
                  <div class="form-row">
                    <label class="form-label">{{ 'admin.format' | translate }}</label>
                    <input [(ngModel)]="programForm.format" name="format" class="form-input" placeholder="онлайн / офлайн / гибрид" />
                  </div>
                  <div class="form-row">
                    <label class="form-label">{{ 'admin.imageUrl' | translate }}</label>
                    <input [(ngModel)]="programForm.imageUrl" name="imageUrl" class="form-input" placeholder="https://..." />
                  </div>
                  <div class="form-row form-row-inline">
                    <div class="form-field">
                      <label class="form-label">{{ 'admin.price' | translate }}</label>
                      <input type="number" [(ngModel)]="programForm.price" name="price" class="form-input form-input-sm" [placeholder]="'admin.pricePlaceholder' | translate" />
                    </div>
                    <div class="form-field">
                      <label class="form-label">{{ 'admin.schedule' | translate }}</label>
                      <input [(ngModel)]="programForm.schedule" name="schedule" class="form-input" placeholder="Пн, Ср 16:00" />
                    </div>
                  </div>
                </div>
                <div class="modal-actions">
                  <button type="button" (click)="closeProgramForm()" class="btn-secondary">{{ 'admin.cancel' | translate }}</button>
                  <button type="submit" class="btn-primary">{{ 'admin.save' | translate }}</button>
                </div>
              </form>
              </div>
            </div>
          </div>
        }
      }

      @if (tab() === 'groups') {
        @if (loadingGroups()) {
          <p class="loading-text">{{ 'admin.loading' | translate }}</p>
        } @else if (adminGroups().length === 0) {
          <div class="programs-toolbar">
            <button (click)="openGroupForm()" class="btn-add">{{ 'admin.addGroup' | translate }}</button>
          </div>
          <p class="empty-state">{{ 'admin.noGroups' | translate }}</p>
        } @else {
          <div class="grouped-list">
            @for (p of adminPrograms(); track p.id) {
              @let pGroups = getGroupsByProgram(p.id);
              @if (pGroups.length > 0) {
                <div class="school-type-group">
                  <div class="group-header">
                    <h3>{{ p.title }} <span class="badge-mini">{{ getSchoolTypeTitle(p.schoolType || '') }}</span></h3>
                    <button (click)="openGroupForm({programId: p.id})" class="btn-add-inline">+ {{ 'admin.addGroup' | translate }}</button>
                  </div>
                  <div class="list">
                    @for (g of pGroups; track g.id) {
                      <div class="row">
                        <div class="row-content">
                          <strong>{{ g.title || ('admin.tabGroups' | translate) }}</strong>
                          <span class="schedule">{{ g.schedule }}</span>
                        </div>
                        <div class="row-actions">
                          <button (click)="editGroup(g)">{{ 'admin.edit' | translate }}</button>
                          <button (click)="openHomeworkForm(g)">{{ 'admin.homework' | translate }}</button>
                          <button (click)="openAnnouncementForm(g)">{{ 'admin.announcement' | translate }}</button>
                          <button (click)="deleteGroup(g)" class="btn-danger">{{ 'admin.delete' | translate }}</button>
                        </div>
                      </div>
                    }
                  </div>
                </div>
              }
            }
          </div>
          <div class="footer-actions">
            <button (click)="openGroupForm()" class="btn-add-ghost">{{ 'admin.addGroup' | translate }}</button>
          </div>
        }
        @if (showGroupForm()) {
          <div class="modal-overlay" (click)="closeGroupForm()">
            <div class="modal" (click)="$event.stopPropagation()">
              <div class="modal-header">
                <h3>{{ (editingGroup() ? 'admin.edit' : 'admin.addGroup') | translate }} {{ 'admin.tabGroups' | translate }}</h3>
                <button type="button" class="modal-close" (click)="closeGroupForm()">×</button>
              </div>
              <form (ngSubmit)="saveGroup()" class="modal-body">
                <div class="form-row">
                  <label class="form-label">{{ 'admin.groupProgram' | translate }}</label>
                  <select [(ngModel)]="groupForm.programId" name="programId" class="form-input" required>
                    @for (p of adminPrograms(); track p.id) {
                      <option [value]="p.id">{{ p.title }}</option>
                    }
                  </select>
                </div>
                <div class="form-row">
                  <label class="form-label">{{ 'admin.groupTitle' | translate }}</label>
                  <input [(ngModel)]="groupForm.title" name="title" class="form-input" placeholder="Группа А" />
                </div>
                <div class="form-row">
                  <label class="form-label">{{ 'admin.groupSchedule' | translate }}</label>
                  <input [(ngModel)]="groupForm.schedule" name="schedule" class="form-input" placeholder="Пн 16:00, Ср 16:00" required />
                </div>
                <div class="modal-actions">
                  <button type="button" (click)="closeGroupForm()" class="btn-secondary">{{ 'admin.cancel' | translate }}</button>
                  <button type="submit" class="btn-primary">{{ 'admin.save' | translate }}</button>
                </div>
              </form>
            </div>
          </div>
        }
        @if (showHomeworkForm()) {
          <div class="modal-overlay" (click)="closeHomeworkForm()">
            <div class="modal" (click)="$event.stopPropagation()">
              <div class="modal-header">
                <h3>{{ 'admin.homework' | translate }}: {{ homeworkGroup()?.title || homeworkGroup()?.programTitle }}</h3>
                <button type="button" class="modal-close" (click)="closeHomeworkForm()">×</button>
              </div>
              <div class="modal-body">
                @if (groupHomework().length > 0) {
                  <div class="homework-list">
                    @for (hw of groupHomework(); track hw.id) {
                      <div class="homework-item">
                        <strong>{{ hw.title }}</strong> — {{ 'programDetail.lesson' | translate }} {{ hw.lessonN }}
                      </div>
                    }
                  </div>
                }
                <form (ngSubmit)="saveHomework()" class="form-section">
                  <label class="form-label">{{ 'admin.homeworkLesson' | translate }}</label>
                  <input type="number" [(ngModel)]="homeworkForm.lessonN" name="lessonN" class="form-input" min="1" />
                  <label class="form-label">{{ 'admin.homeworkTitle' | translate }}</label>
                  <input [(ngModel)]="homeworkForm.title" name="title" class="form-input" required />
                  <label class="form-label">{{ 'admin.description' | translate }}</label>
                  <textarea [(ngModel)]="homeworkForm.description" name="desc" class="form-input form-textarea" rows="3"></textarea>
                  <button type="submit" class="btn-primary">{{ 'admin.addHomework' | translate }}</button>
                </form>
              </div>
            </div>
          </div>
        }
        @if (showAnnouncementForm()) {
          <div class="modal-overlay" (click)="closeAnnouncementForm()">
            <div class="modal" (click)="$event.stopPropagation()">
              <div class="modal-header">
                <h3>{{ 'admin.addAnnouncement' | translate }}: {{ announcementGroup()?.title || announcementGroup()?.programTitle }}</h3>
                <button type="button" class="modal-close" (click)="closeAnnouncementForm()">×</button>
              </div>
              <form (ngSubmit)="saveAnnouncement()" class="modal-body">
                <div class="form-row">
                  <label class="form-label">{{ 'admin.announcementTitle' | translate }}</label>
                  <input [(ngModel)]="announcementForm.title" name="title" class="form-input" required />
                </div>
                <div class="form-row">
                  <label class="form-label">{{ 'admin.announcementBody' | translate }}</label>
                  <textarea [(ngModel)]="announcementForm.body" name="body" class="form-input form-textarea" rows="4"></textarea>
                </div>
                <div class="modal-actions">
                  <button type="button" (click)="closeAnnouncementForm()" class="btn-secondary">{{ 'admin.cancel' | translate }}</button>
                  <button type="submit" class="btn-primary">{{ 'admin.save' | translate }}</button>
                </div>
              </form>
            </div>
          </div>
        }
      }

      @if (tab() === 'schoolTypes') {
        <div class="school-types-toolbar">
          <button (click)="openSchoolTypeForm()" class="btn-add">{{ 'admin.addSchoolType' | translate }}</button>
        </div>
        @if (loadingSchoolTypes()) {
          <p class="loading-text">{{ 'admin.loading' | translate }}</p>
        } @else if (adminSchoolTypes().length === 0) {
          <div class="empty-state">
            <p>{{ 'admin.noSchoolTypes' | translate }}</p>
            <button (click)="openSchoolTypeForm()" class="btn-add">{{ 'admin.addSchoolType' | translate }}</button>
          </div>
        } @else {
          <div class="list">
            @for (st of adminSchoolTypes(); track st.id) {
              <div class="row">
                <div class="row-content">
                  @if (st.sortOrder != null) {
                    <span class="row-order">{{ st.sortOrder }}</span>
                  }
                  <div class="row-info">
                    <strong>{{ st.title }}</strong>
                    @if (st.description) {
                      <span class="muted">{{ st.description }}</span>
                    }
                  </div>
                </div>
                <div class="row-actions">
                  <button (click)="editSchoolType(st)">{{ 'admin.edit' | translate }}</button>
                </div>
              </div>
            }
          </div>
        }
        @if (showSchoolTypeForm()) {
          <div class="modal-overlay" (click)="closeSchoolTypeForm()">
            <div class="modal modal-school-type" (click)="$event.stopPropagation()">
              <div class="modal-header">
                <h3>{{ (editingSchoolType() ? 'admin.editSchoolType' : 'admin.newSchoolType') | translate }}</h3>
                <button type="button" class="modal-close" (click)="closeSchoolTypeForm()" aria-label="Close">×</button>
              </div>
              <div class="modal-body">
              @if (schoolTypeError()) {
                <div class="form-error">{{ schoolTypeError() }}</div>
              }
              @if (schoolTypeSuccess()) {
                <div class="form-success">{{ schoolTypeSuccess() }}</div>
              }
              <form (ngSubmit)="saveSchoolType()">
                <div class="form-tabs">
                  <button type="button" [class.active]="schoolTypeFormLang() === 'ru'" (click)="schoolTypeFormLang.set('ru')">RU</button>
                  <button type="button" [class.active]="schoolTypeFormLang() === 'sr'" (click)="schoolTypeFormLang.set('sr')">SR</button>
                  <button type="button" [class.active]="schoolTypeFormLang() === 'en'" (click)="schoolTypeFormLang.set('en')">EN</button>
                </div>
                <div class="form-section">
                  @if (schoolTypeFormLang() === 'ru') {
                    <label class="form-label">{{ 'admin.programTitle' | translate }} (RU)</label>
                    <input [(ngModel)]="schoolTypeForm.titleRu" name="titleRu" required class="form-input" />
                    <label class="form-label">{{ 'admin.description' | translate }} (RU)</label>
                    <textarea [(ngModel)]="schoolTypeForm.descriptionRu" name="descRu" rows="4" class="form-input form-textarea" [placeholder]="'admin.descriptionPlaceholder' | translate"></textarea>
                  }
                  @if (schoolTypeFormLang() === 'sr') {
                    <label class="form-label">{{ 'admin.programTitle' | translate }} (SR)</label>
                    <input [(ngModel)]="schoolTypeForm.titleSr" name="titleSr" class="form-input" />
                    <label class="form-label">{{ 'admin.description' | translate }} (SR)</label>
                    <textarea [(ngModel)]="schoolTypeForm.descriptionSr" name="descSr" rows="4" class="form-input form-textarea" [placeholder]="'admin.descriptionPlaceholder' | translate"></textarea>
                  }
                  @if (schoolTypeFormLang() === 'en') {
                    <label class="form-label">{{ 'admin.programTitle' | translate }} (EN)</label>
                    <input [(ngModel)]="schoolTypeForm.titleEn" name="titleEn" class="form-input" />
                    <label class="form-label">{{ 'admin.description' | translate }} (EN)</label>
                    <textarea [(ngModel)]="schoolTypeForm.descriptionEn" name="descEn" rows="4" class="form-input form-textarea" [placeholder]="'admin.descriptionPlaceholder' | translate"></textarea>
                  }
                </div>
                <hr class="form-divider" />
                <div class="form-section">
                  <label class="form-label">{{ 'admin.sortOrder' | translate }}</label>
                  <input type="number" [(ngModel)]="schoolTypeForm.sortOrder" name="sortOrder" class="form-input form-input-sm" style="max-width:100px" />
                </div>
                <div class="modal-actions">
                  <button type="button" (click)="closeSchoolTypeForm()" class="btn-secondary">{{ 'admin.cancel' | translate }}</button>
                  <button type="submit" class="btn-primary">{{ 'admin.save' | translate }}</button>
                </div>
              </form>
              </div>
            </div>
          </div>
        }
      }

      @if (tab() === 'students') {
        <input type="search" [placeholder]="'admin.searchStudents' | translate" (input)="onSearch($event)" class="search-input" />
        @if (loadingStudents()) {
          <p class="loading-text">{{ 'admin.loading' | translate }}</p>
        } @else if (adminStudents().length === 0) {
          <p class="empty-state">{{ 'admin.noStudents' | translate }}</p>
        } @else {
          <div class="students-list">
            <div class="students-header">
              <span>{{ 'admin.enrollmentStudent' | translate }}</span>
              <span>Email</span>
            </div>
            @for (s of adminStudents(); track s.id) {
              <div class="student-row">
                <div class="student-avatar"></div>
                <div class="student-info">
                  <span class="student-name">{{ s.name }}</span>
                  <span class="student-email">{{ s.email }}</span>
                </div>
              </div>
            }
          </div>
        }
      }

      @if (tab() === 'enrollments') {
        @if (loadingEnrollments()) {
          <p class="loading-text">{{ 'admin.loading' | translate }}</p>
        } @else if (adminEnrollments().length === 0) {
          <p class="empty-state">{{ 'admin.noEnrollments' | translate }}</p>
        } @else {
          <div class="enrollments-list">
            <div class="enrollments-header">
              <span>{{ 'admin.enrollmentStudent' | translate }}</span>
              <span>{{ 'admin.enrollmentProgram' | translate }}</span>
              <span>{{ 'admin.assignGroup' | translate }}</span>
              <span>{{ 'admin.progress' | translate }}</span>
              <span>{{ 'admin.enrollmentDate' | translate }}</span>
              <span>{{ 'admin.status' | translate }}</span>
            </div>
            @for (e of adminEnrollments(); track e.id) {
              <div class="enrollment-row">
                <div class="enrollment-student">
                  <span class="enrollment-name">{{ e.studentName }}</span>
                  <span class="enrollment-email">{{ e.studentEmail }}</span>
                </div>
                <a [routerLink]="['/programs', e.programId]" class="enrollment-program">{{ e.programTitle }}</a>
                <select class="form-input form-input-sm" [value]="e.groupId || ''" (change)="assignEnrollmentGroup(e.id, $event)">
                  <option value="">—</option>
                  @for (g of getGroupsForProgram(e.programId); track g.id) {
                    <option [value]="g.id">{{ g.title || g.schedule }}</option>
                  }
                </select>
                <input type="number" class="form-input form-input-sm progress-input" min="0" max="100" [value]="e.progress ?? 0" (change)="updateEnrollmentProgress(e.id, $event)" />
                <span class="enrollment-date">{{ formatDate(e.enrolledAt) }}</span>
                <span class="enrollment-status">{{ e.status }}</span>
              </div>
            }
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .page { padding: 2rem 0; }
    .tabs { display: flex; gap: 0.5rem; margin-bottom: 2rem; flex-wrap: wrap; }
    .tabs button {
      padding: 0.5rem 1rem;
      min-height: 44px;
      border: 1px solid var(--color-border);
      background: var(--color-bg-alt);
      border-radius: var(--radius);
      cursor: pointer;
      transition: all var(--transition);
    }
    .tabs button:hover { background: var(--color-bg-card); }
    .tabs button.active { background: var(--color-primary); color: white; border-color: var(--color-primary); }
    .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 2rem; }
    .stat-card {
      padding: 1.5rem;
      background: var(--color-bg-alt);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      text-align: center;
    }
    .stat-card .num { display: block; font-size: 2rem; font-weight: 700; color: var(--color-primary); }
    .btn-add { padding: 0.5rem 1rem; background: var(--color-primary); color: white; border: none; border-radius: var(--radius); cursor: pointer; min-height: 44px; }
    .programs-toolbar { display: flex; gap: 1rem; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; }
    .programs-toolbar select { padding: 0.5rem 1rem; min-height: 44px; border-radius: var(--radius); border: 1px solid var(--color-border); background: var(--color-bg); }
    .list, .students-list { display: flex; flex-direction: column; gap: 0.5rem; }
    .grouped-list { display: flex; flex-direction: column; gap: 2rem; }
    .school-type-group { border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: rgba(255,255,255,0.02); padding: 1.5rem; }
    .group-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; border-bottom: 1px solid var(--color-border); padding-bottom: 0.75rem; }
    .group-header h3 { margin: 0; font-size: 1.25rem; color: var(--color-primary); }
    .btn-add-inline { padding: 0.4rem 0.8rem; font-size: 0.85rem; background: var(--color-primary); color: white; border-radius: var(--radius); border: none; cursor: pointer; }
    .groups-count { font-size: 0.85rem; color: var(--color-primary); cursor: pointer; text-decoration: underline; margin-top: 0.2rem; }
    .groups-count:hover { color: var(--color-primary-hover); }
    .badge-mini { font-size: 0.75rem; background: var(--color-bg); padding: 0.1rem 0.4rem; border-radius: 4px; color: var(--color-muted); vertical-align: middle; margin-left: 0.5rem; }
    .footer-actions { margin-top: 2rem; display: flex; justify-content: center; }
    .btn-add-ghost { background: transparent; border: 1px dashed var(--color-border); padding: 0.6rem 2rem; color: var(--color-muted); cursor: pointer; border-radius: var(--radius); }
    .btn-add-ghost:hover { border-color: var(--color-primary); color: var(--color-primary); }
    .row { background: var(--color-bg); margin-bottom: 0.75rem; border: 1px solid transparent; transition: border-color var(--transition); }
    .row:hover { border-color: var(--color-border); }
    .row, .student-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.75rem 1rem;
      background: var(--color-bg-alt);
      border-radius: var(--radius);
    }
    .row-content { display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; }
    .row-thumb { width: 48px; height: 48px; object-fit: cover; border-radius: var(--radius); }
    .row-info { display: flex; flex-direction: column; gap: 0.15rem; }
    .row-order { display: inline-flex; align-items: center; justify-content: center; min-width: 28px; height: 28px; background: var(--color-bg); border-radius: 6px; font-size: 0.85rem; color: var(--color-muted); }
    .school-types-toolbar { margin-bottom: 1rem; }
    .loading-text, .empty-state { color: var(--color-muted); margin: 1rem 0; }
    .empty-state { display: flex; flex-direction: column; gap: 1rem; align-items: flex-start; }
    .loading-skeleton .skeleton { animation: pulse 1.5s ease-in-out infinite; }
    .popular-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; }
    .popular-card { display: flex; flex-direction: column; padding: 1rem; background: var(--color-bg-alt); border-radius: var(--radius); text-decoration: none; color: inherit; transition: background var(--transition), transform var(--transition); }
    .popular-card:hover { background: var(--color-bg-card); transform: translateY(-2px); }
    .popular-count { font-size: 0.9rem; color: var(--color-primary); font-weight: 600; margin-top: 0.25rem; }
    .students-header { display: none; }
    .student-row { display: flex; align-items: center; gap: 1rem; }
    .student-avatar { width: 40px; height: 40px; border-radius: 50%; background: var(--color-bg); flex-shrink: 0; }
    .student-info { display: flex; flex-direction: column; gap: 0.1rem; }
    .student-name { font-weight: 600; }
    .student-email { font-size: 0.9rem; color: var(--color-muted); }
    .search-input { margin-bottom: 1rem; }
    .enrollments-header { display: grid; grid-template-columns: 1fr 1fr minmax(120px,auto) minmax(60px,auto) minmax(80px,auto) minmax(70px,auto); gap: 1rem; padding: 0.75rem 1rem; background: var(--color-bg); border-radius: var(--radius); margin-bottom: 0.5rem; font-size: 0.85rem; font-weight: 600; color: var(--color-muted); }
    .enrollment-row { display: grid; grid-template-columns: 1fr 1fr minmax(120px,auto) minmax(60px,auto) minmax(80px,auto) minmax(70px,auto); gap: 1rem; padding: 0.75rem 1rem; background: var(--color-bg-alt); border-radius: var(--radius); align-items: center; margin-bottom: 0.5rem; }
    .enrollment-student { display: flex; flex-direction: column; gap: 0.1rem; }
    .enrollment-name { font-weight: 600; }
    .enrollment-email { font-size: 0.85rem; color: var(--color-muted); }
    .enrollment-program { color: var(--color-primary); text-decoration: none; }
    .enrollment-program:hover { text-decoration: underline; }
    .enrollment-date { font-size: 0.9rem; color: var(--color-muted); }
    .enrollment-status { font-size: 0.85rem; }
    @keyframes pulse { 50% { opacity: 0.5; } }
    .curriculum-list { display: flex; flex-direction: column; gap: 1rem; }
    .lesson-editor {
      padding: 1rem;
      background: var(--color-bg);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      display: flex; flex-direction: column; gap: 0.5rem;
    }
    .lesson-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem; }
    .lesson-num { font-weight: 600; color: var(--color-primary); }
    .btn-remove { padding: 0.25rem 0.5rem; font-size: 0.85rem; background: transparent; color: var(--color-error); border: 1px solid var(--color-error); border-radius: 6px; cursor: pointer; }
    .btn-remove:hover { background: rgba(248,113,113,0.1); }
    .btn-add-lesson { align-self: flex-start; padding: 0.5rem 1rem; background: var(--color-bg); border: 1px dashed var(--color-border); border-radius: var(--radius); color: var(--color-muted); cursor: pointer; }
    .btn-add-lesson:hover { border-color: var(--color-primary); color: var(--color-primary); }
    .row-actions { display: flex; gap: 0.5rem; }
    .row-actions button { min-height: 38px; padding: 0.4rem 0.9rem; }
    .age, .muted { color: var(--color-muted); font-size: 0.9rem; }
    .btn-danger { background: var(--color-error); color: white; border-color: var(--color-error); }
    input[type="search"] {
      width: 100%;
      max-width: 400px;
      padding: 0.6rem 1rem;
      margin-bottom: 1rem;
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      background: var(--color-bg);
    }
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.6);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 1rem;
    }
    .modal {
      background: var(--color-bg-alt);
      padding: 0;
      border-radius: var(--radius-lg);
      max-width: 560px;
      width: 100%;
      max-height: 92vh;
      overflow-y: auto;
      box-shadow: var(--shadow-lg);
      border: 1px solid var(--color-border);
    }
    .modal-program { max-width: 640px; }
    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1.25rem 1.5rem;
      border-bottom: 1px solid var(--color-border);
    }
    .modal-header h3 { margin: 0; font-size: 1.2rem; }
    .modal-close {
      width: 36px;
      height: 36px;
      padding: 0;
      border: none;
      background: transparent;
      color: var(--color-muted);
      font-size: 1.5rem;
      line-height: 1;
      cursor: pointer;
      border-radius: var(--radius);
      transition: color var(--transition), background var(--transition);
    }
    .modal-close:hover { color: var(--color-text); background: var(--color-bg); }
    .modal-body { padding: 0 1.5rem 1.5rem; }
    .modal form { padding: 0; }
    .form-section { display: flex; flex-direction: column; gap: 1rem; margin-bottom: 0; }
    .form-section-params { display: grid; gap: 0.75rem; }
    .form-row { display: flex; flex-direction: column; gap: 0.25rem; }
    .form-row-inline { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .form-field { display: flex; flex-direction: column; gap: 0.25rem; }
    .form-label {
      display: block;
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--color-text);
      margin-bottom: 0.15rem;
    }
    .form-hint {
      font-weight: 400;
      font-size: 0.8rem;
      color: var(--color-muted);
    }
    .form-input, .form-textarea {
      width: 100%;
      padding: 0.6rem 0.85rem;
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      background: var(--color-bg);
      color: var(--color-text);
      font-family: inherit;
      font-size: 0.95rem;
      transition: border-color var(--transition);
    }
    .form-input:focus, .form-textarea:focus {
      outline: none;
      border-color: var(--color-primary);
      box-shadow: 0 0 0 3px rgba(99,102,241,0.2);
    }
    .form-textarea { resize: vertical; min-height: 80px; }
    .form-code { font-family: 'Consolas', 'Monaco', monospace; font-size: 0.85rem; line-height: 1.5; }
    .form-input-sm { max-width: 100px; }
    .form-divider { margin: 1.25rem 0; border: none; border-top: 1px solid var(--color-border); }
    .modal-actions { display: flex; gap: 0.75rem; margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--color-border); }
    .btn-primary {
      padding: 0.6rem 1.25rem;
      background: var(--color-primary);
      color: white;
      border: none;
      border-radius: var(--radius);
      cursor: pointer;
      font-weight: 600;
      min-height: 44px;
      transition: background var(--transition);
    }
    .btn-primary:hover { background: var(--color-primary-hover); }
    .btn-secondary {
      padding: 0.6rem 1.25rem;
      background: var(--color-bg);
      color: var(--color-text);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      cursor: pointer;
      min-height: 44px;
      transition: background var(--transition), border-color var(--transition);
    }
    .btn-secondary:hover { background: var(--color-bg-alt); border-color: var(--color-muted); }
    .form-error { color: var(--color-error); padding: 0.75rem 1rem; background: rgba(248,113,113,0.1); border-radius: var(--radius); margin-bottom: 1rem; }
    .form-success { color: var(--color-success); padding: 0.75rem 1rem; background: rgba(52,211,153,0.1); border-radius: var(--radius); margin-bottom: 1rem; }
    .form-tabs { display: flex; gap: 0.4rem; margin-bottom: 1.25rem; }
    .form-tabs button {
      padding: 0.45rem 1rem;
      border-radius: 999px;
      border: 1px solid var(--color-border);
      background: var(--color-bg);
      color: var(--color-muted);
      cursor: pointer;
      font-size: 0.9rem;
      transition: all var(--transition);
    }
    .form-tabs button:hover { color: var(--color-text); }
    .form-tabs button.active { background: var(--color-primary); color: white; border-color: var(--color-primary); }
    @media (max-width: 600px) {
      .form-row-inline { grid-template-columns: 1fr; }
      .stats-grid { grid-template-columns: 1fr; }
      .modal { max-height: 95vh; border-radius: var(--radius); }
      .row { flex-direction: column; align-items: stretch; }
      .row-actions { justify-content: flex-start; }
    }
  `],
})
export class AdminComponent implements OnInit {
  tab = signal<'stats' | 'programs' | 'groups' | 'schoolTypes' | 'students' | 'enrollments'>('stats');
  stats = signal<Stats | null>(null);
  loadingStats = signal(true);
  loadingPrograms = signal(false);
  loadingSchoolTypes = signal(false);
  loadingStudents = signal(false);
  loadingEnrollments = signal(false);
  loadingGroups = signal(false);
  adminPrograms = signal<Program[]>([]);
  programFilter = signal<string>('');
  schoolTypes = signal<SchoolType[]>([]);
  adminSchoolTypes = signal<SchoolType[]>([]);
  adminStudents = signal<Student[]>([]);
  adminEnrollments = signal<Enrollment[]>([]);
  adminGroups = signal<Group[]>([]);
  groupFilterProgram = signal<string>('');
  showGroupForm = signal(false);
  editingGroup = signal<Group | null>(null);
  groupForm = { programId: '', title: '', schedule: '' };
  showHomeworkForm = signal(false);
  homeworkGroup = signal<Group | null>(null);
  showAnnouncementForm = signal(false);
  announcementGroup = signal<Group | null>(null);
  announcementForm = { title: '', body: '' };
  groupHomework = signal<Homework[]>([]);
  homeworkForm = { lessonN: 1, title: '', description: '' };
  showProgramForm = signal(false);
  showSchoolTypeForm = signal(false);
  editingProgram = signal<Program | null>(null);
  editingSchoolType = signal<SchoolType | null>(null);
  schoolTypeError = signal<string | null>(null);
  schoolTypeSuccess = signal<string | null>(null);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);
  programForm = {
    titleRu: '',
    titleSr: '',
    titleEn: '',
    slug: '',
    descriptionRu: '',
    descriptionSr: '',
    descriptionEn: '',
    ageMin: 5,
    ageMax: 18,
    schoolType: 'tech',
    durationWeeks: 12,
    lessonsPerWeek: 1,
    format: '',
    imageUrl: '' as string | null,
    price: null as number | string | null,
    schedule: '',
    curriculumRu: [] as Lesson[],
    curriculumSr: [] as Lesson[],
    curriculumEn: [] as Lesson[],
  };
  schoolTypeForm = { titleRu: '', titleSr: '', titleEn: '', descriptionRu: '', descriptionSr: '', descriptionEn: '', sortOrder: 0 };
  programFormLang = signal<'ru' | 'sr' | 'en'>('ru');
  schoolTypeFormLang = signal<'ru' | 'sr' | 'en'>('ru');
  private searchTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private api: ApiService,
    private translate: TranslateService,
  ) { }

  ngOnInit() {
    this.loadStats();
    this.api.get<{ success: boolean; schoolTypes: SchoolType[] }>('/programs/meta/school-types').subscribe({
      next: (r) => { if (r.success) this.schoolTypes.set(r.schoolTypes); },
    });
  }

  loadStats() {
    this.loadingStats.set(true);
    this.api.get<{ success: boolean; stats: Stats }>('/admin/stats').subscribe({
      next: (res) => {
        if (res.success) this.stats.set(res.stats);
        this.loadingStats.set(false);
      },
      error: () => this.loadingStats.set(false),
    });
  }

  loadSchoolTypes() {
    this.loadingSchoolTypes.set(true);
    this.api.get<{ success: boolean; schoolTypes: SchoolType[] }>('/admin/school-types').subscribe({
      next: (r) => {
        if (r.success) this.adminSchoolTypes.set(r.schoolTypes);
        this.loadingSchoolTypes.set(false);
      },
      error: () => {
        this.api.get<{ success: boolean; schoolTypes: SchoolType[] }>('/programs/meta/school-types').subscribe({
          next: (res) => {
            if (res.success) this.adminSchoolTypes.set(res.schoolTypes);
            this.loadingSchoolTypes.set(false);
          },
          error: () => this.loadingSchoolTypes.set(false),
        });
      },
    });
  }

  loadPrograms() {
    this.loadingPrograms.set(true);
    this.api.get<{ success: boolean; programs: Program[] }>('/admin/programs').subscribe({
      next: (res) => {
        if (res.success) this.adminPrograms.set(res.programs);
        this.loadingPrograms.set(false);
      },
      error: () => this.loadingPrograms.set(false),
    });
  }

  filteredPrograms = computed(() => {
    const filter = this.programFilter();
    const list = this.adminPrograms();
    if (!filter) return list;
    return list.filter((p) => (p.schoolType || 'tech') === filter);
  });

  onProgramFilter(e: Event) {
    const v = (e.target as HTMLSelectElement).value;
    this.programFilter.set(v);
  }

  getSchoolTypeTitle(id: string): string {
    const st = this.schoolTypes().find((s) => s.id === id);
    return st?.title || id || '';
  }

  loadStudents(search?: string) {
    this.loadingStudents.set(true);
    let path = '/admin/students';
    if (search) path += '?search=' + encodeURIComponent(search);
    this.api.get<{ success: boolean; students: Student[] }>(path).subscribe({
      next: (res) => {
        if (res.success) this.adminStudents.set(res.students);
        this.loadingStudents.set(false);
      },
      error: () => this.loadingStudents.set(false),
    });
  }

  loadEnrollments() {
    this.loadingEnrollments.set(true);
    this.api.get<{ success: boolean; enrollments: Enrollment[] }>('/admin/enrollments').subscribe({
      next: (res) => {
        if (res.success) this.adminEnrollments.set(res.enrollments);
        this.loadingEnrollments.set(false);
      },
      error: () => this.loadingEnrollments.set(false),
    });
  }

  loadGroups() {
    this.loadingGroups.set(true);
    this.api.get<{ success: boolean; groups: Group[] }>('/admin/groups').subscribe({
      next: (res) => {
        if (res.success) this.adminGroups.set(res.groups);
        this.loadingGroups.set(false);
      },
      error: () => this.loadingGroups.set(false),
    });
  }

  openGroupForm(initial?: Partial<typeof this.groupForm>) {
    this.editingGroup.set(null);
    this.groupForm = { programId: this.adminPrograms().length > 0 ? this.adminPrograms()[0].id : '', title: '', schedule: '' };
    if (initial) {
      Object.assign(this.groupForm, initial);
    }
    this.showGroupForm.set(true);
  }

  getGroupsByProgram(pId: string) {
    return this.adminGroups().filter(g => g.programId === pId);
  }

  editGroup(g: Group) {
    this.editingGroup.set(g);
    this.groupForm = { programId: g.programId, title: g.title || '', schedule: g.schedule || '' };
    this.showGroupForm.set(true);
  }

  closeGroupForm() {
    this.showGroupForm.set(false);
    this.editingGroup.set(null);
  }

  saveGroup() {
    if (!this.groupForm.programId || !this.groupForm.schedule?.trim()) return;
    const body = { programId: this.groupForm.programId, title: this.groupForm.title?.trim() || '', schedule: this.groupForm.schedule.trim() };
    const g = this.editingGroup();
    if (g) {
      this.api.put<{ success: boolean }>(`/admin/groups/${g.id}`, body).subscribe({
        next: () => { this.loadGroups(); this.closeGroupForm(); },
      });
    } else {
      this.api.post<{ success: boolean }>('/admin/groups', body).subscribe({
        next: () => { this.loadGroups(); this.closeGroupForm(); },
      });
    }
  }

  deleteGroup(g: Group) {
    if (!confirm(`Удалить группу «${g.title || g.programTitle}»?`)) return;
    this.api.delete<{ success: boolean }>(`/admin/groups/${g.id}`).subscribe({
      next: () => this.loadGroups(),
    });
  }

  openHomeworkForm(g: Group) {
    this.homeworkGroup.set(g);
    this.homeworkForm = { lessonN: 1, title: '', description: '' };
    this.api.get<{ success: boolean; homework: Homework[] }>(`/admin/groups/${g.id}/homework`).subscribe({
      next: (res) => { if (res.success) this.groupHomework.set(res.homework); },
    });
    this.showHomeworkForm.set(true);
  }

  closeHomeworkForm() {
    this.showHomeworkForm.set(false);
    this.homeworkGroup.set(null);
  }

  openAnnouncementForm(g: Group) {
    this.announcementGroup.set(g);
    this.announcementForm = { title: '', body: '' };
    this.showAnnouncementForm.set(true);
  }

  closeAnnouncementForm() {
    this.showAnnouncementForm.set(false);
    this.announcementGroup.set(null);
  }

  saveAnnouncement() {
    const g = this.announcementGroup();
    if (!g || !this.announcementForm.title.trim()) return;
    this.api.post<{ success: boolean }>('/admin/announcements', {
      groupId: g.id,
      title: this.announcementForm.title.trim(),
      body: this.announcementForm.body.trim(),
    }).subscribe({
      next: () => {
        this.closeAnnouncementForm();
      },
    });
  }

  getGroupsForProgram(programId: string): Group[] {
    return this.adminGroups().filter((g) => g.programId === programId);
  }

  assignEnrollmentGroup(enrollmentId: string, ev: Event) {
    const v = (ev.target as HTMLSelectElement).value;
    this.api.put<{ success: boolean }>(`/admin/enrollments/${enrollmentId}/group`, { groupId: v || null }).subscribe({
      next: () => this.loadEnrollments(),
    });
  }

  updateEnrollmentProgress(enrollmentId: string, ev: Event) {
    const v = (ev.target as HTMLInputElement).value;
    const p = Math.min(100, Math.max(0, parseInt(v, 10) || 0));
    this.api.put<{ success: boolean }>(`/admin/enrollments/${enrollmentId}/progress`, { progress: p }).subscribe({
      next: () => this.loadEnrollments(),
    });
  }

  saveHomework() {
    const g = this.homeworkGroup();
    if (!g || !this.homeworkForm.title?.trim()) return;
    this.api.post<{ success: boolean }>('/admin/homework', {
      groupId: g.id,
      lessonN: this.homeworkForm.lessonN || 1,
      title: this.homeworkForm.title.trim(),
      description: this.homeworkForm.description?.trim() || '',
    }).subscribe({
      next: () => {
        this.homeworkForm = { lessonN: 1, title: '', description: '' };
        this.api.get<{ success: boolean; homework: Homework[] }>(`/admin/groups/${g.id}/homework`).subscribe({
          next: (res) => { if (res.success) this.groupHomework.set(res.homework); },
        });
      },
    });
  }

  formatDate(ts: number): string {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  openSchoolTypeForm() {
    this.editingSchoolType.set(null);
    this.schoolTypeError.set(null);
    this.schoolTypeSuccess.set(null);
    this.schoolTypeFormLang.set('ru');
    this.schoolTypeForm = { titleRu: '', titleSr: '', titleEn: '', descriptionRu: '', descriptionSr: '', descriptionEn: '', sortOrder: 0 };
    this.showSchoolTypeForm.set(true);
  }

  resetProgramForm() {
    this.programFormLang.set('ru');
    this.programForm = {
      titleRu: '',
      titleSr: '',
      titleEn: '',
      slug: '',
      descriptionRu: '',
      descriptionSr: '',
      descriptionEn: '',
      ageMin: 5,
      ageMax: 18,
      schoolType: 'tech',
      durationWeeks: 12,
      lessonsPerWeek: 1,
      format: '',
      imageUrl: null,
      price: null,
      schedule: '',
      curriculumRu: [],
      curriculumSr: [],
      curriculumEn: [],
    };
  }

  openProgramForm(initial?: Partial<typeof this.programForm>) {
    this.resetProgramForm();
    if (initial) {
      Object.assign(this.programForm, initial);
    }
    this.showProgramForm.set(true);
    this.editingProgram.set(null);
    this.errorMessage.set(null);
    this.successMessage.set(null);
  }

  addLesson(lang: 'ru' | 'sr' | 'en') {
    const arr = lang === 'ru' ? this.programForm.curriculumRu : lang === 'sr' ? this.programForm.curriculumSr : this.programForm.curriculumEn;
    const n = arr.length + 1;
    const newLesson: Lesson = { n, topic: '', description: '', conclusions: '', result: '' };
    if (lang === 'ru') this.programForm.curriculumRu = [...arr, newLesson];
    else if (lang === 'sr') this.programForm.curriculumSr = [...arr, newLesson];
    else this.programForm.curriculumEn = [...arr, newLesson];
  }

  removeLesson(lang: 'ru' | 'sr' | 'en', index: number) {
    const arr = lang === 'ru' ? this.programForm.curriculumRu : lang === 'sr' ? this.programForm.curriculumSr : this.programForm.curriculumEn;
    const next = arr.filter((_, i) => i !== index).map((l, i) => ({ ...l, n: i + 1 }));
    if (lang === 'ru') this.programForm.curriculumRu = next;
    else if (lang === 'sr') this.programForm.curriculumSr = next;
    else this.programForm.curriculumEn = next;
  }

  editProgram(p: Program) {
    this.editingProgram.set(p);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.programFormLang.set('ru');
    this.api.get<{ success: boolean; program: Program & { titleRu?: string; titleSr?: string; titleEn?: string; descriptionRu?: string; descriptionSr?: string; descriptionEn?: string; curriculumRu?: Lesson[]; curriculumSr?: Lesson[]; curriculumEn?: Lesson[] } }>(`/admin/programs/raw/${p.id}`).subscribe({
      next: (res) => {
        if (res.success && res.program) {
          const prog = res.program as any;
          this.programForm = {
            titleRu: prog.titleRu ?? prog.title ?? '',
            titleSr: prog.titleSr ?? '',
            titleEn: prog.titleEn ?? '',
            slug: prog.slug ?? '',
            descriptionRu: prog.descriptionRu ?? prog.description ?? '',
            descriptionSr: prog.descriptionSr ?? '',
            descriptionEn: prog.descriptionEn ?? '',
            ageMin: prog.ageMin ?? prog.age_min ?? 5,
            ageMax: prog.ageMax ?? prog.age_max ?? 18,
            schoolType: prog.schoolType ?? prog.school_type ?? 'tech',
            durationWeeks: prog.durationWeeks ?? prog.duration_weeks ?? 12,
            lessonsPerWeek: prog.lessonsPerWeek ?? prog.lessons_per_week ?? 1,
            format: prog.format ?? '',
            imageUrl: prog.imageUrl ?? prog.image_url ?? null,
            price: prog.price ?? null,
            schedule: prog.schedule ?? '',
            curriculumRu: Array.isArray(prog.curriculumRu) ? prog.curriculumRu.map((l: Lesson) => ({ ...l })) : [],
            curriculumSr: Array.isArray(prog.curriculumSr) ? prog.curriculumSr.map((l: Lesson) => ({ ...l })) : [],
            curriculumEn: Array.isArray(prog.curriculumEn) ? prog.curriculumEn.map((l: Lesson) => ({ ...l })) : [],
          };
        }
        this.showProgramForm.set(true);
      },
      error: () => {
        this.programForm = {
          titleRu: p.title,
          titleSr: '',
          titleEn: '',
          slug: p.slug,
          descriptionRu: p.description,
          descriptionSr: '',
          descriptionEn: '',
          ageMin: p.ageMin,
          ageMax: p.ageMax,
          schoolType: p.schoolType || 'tech',
          durationWeeks: p.durationWeeks,
          lessonsPerWeek: p.lessonsPerWeek ?? 1,
          format: p.format || '',
          imageUrl: p.imageUrl ?? null,
          price: p.price ?? null,
          schedule: p.schedule ?? '',
          curriculumRu: p.curriculum?.length ? p.curriculum.map(l => ({ ...l })) : [],
          curriculumSr: [],
          curriculumEn: [],
        };
        this.showProgramForm.set(true);
      },
    });
  }


  getProgramsBySchoolType(stId: string) {
    return this.adminPrograms().filter(p => (p.schoolType || 'tech') === stId);
  }

  getGroupsCount(pId: string) {
    return this.adminGroups().filter(g => g.programId === pId).length;
  }

  closeProgramForm() {
    this.showProgramForm.set(false);
    this.editingProgram.set(null);
    this.errorMessage.set(null);
    this.successMessage.set(null);
  }

  saveProgram() {
    this.errorMessage.set(null);
    const titleRu = this.programForm.titleRu?.trim() ?? '';
    if (!titleRu) {
      this.errorMessage.set(this.translate.instant('admin.titleRequired'));
      return;
    }
    if (this.programForm.ageMin > this.programForm.ageMax) {
      this.errorMessage.set(this.translate.instant('admin.ageError'));
      return;
    }
    const curriculumRu = this.programForm.curriculumRu || [];
    const curriculumSr = this.programForm.curriculumSr || [];
    const curriculumEn = this.programForm.curriculumEn || [];
    const slug = this.programForm.slug?.trim() || titleRu.toLowerCase().replace(/\s+/g, '-').replace(/[^a-zа-яё0-9-]/gi, '');
    const body = {
      titleRu,
      titleSr: this.programForm.titleSr?.trim() ?? titleRu,
      titleEn: this.programForm.titleEn?.trim() ?? titleRu,
      slug,
      descriptionRu: this.programForm.descriptionRu?.trim() ?? '',
      descriptionSr: this.programForm.descriptionSr?.trim() ?? this.programForm.descriptionRu?.trim() ?? '',
      descriptionEn: this.programForm.descriptionEn?.trim() ?? this.programForm.descriptionRu?.trim() ?? '',
      curriculumRu,
      curriculumSr,
      curriculumEn,
      ageMin: this.programForm.ageMin,
      ageMax: this.programForm.ageMax,
      schoolType: this.programForm.schoolType,
      durationWeeks: this.programForm.durationWeeks,
      lessonsPerWeek: this.programForm.lessonsPerWeek ?? 1,
      format: this.programForm.format || '',
      imageUrl: this.programForm.imageUrl?.trim() || null,
      price: (this.programForm.price != null && String(this.programForm.price).trim() !== '' && !Number.isNaN(Number(this.programForm.price))) ? Number(this.programForm.price) : null,
      schedule: this.programForm.schedule?.trim() || null,
    };
    const ed = this.editingProgram();
    if (ed) {
      this.api.put<{ success: boolean }>(`/admin/programs/${ed.id}`, body).subscribe({
        next: () => {
          this.successMessage.set(this.translate.instant('admin.saved'));
          setTimeout(() => {
            this.closeProgramForm();
            this.loadPrograms();
          }, 500);
        },
        error: (err) => {
          this.errorMessage.set(err.error?.error || this.translate.instant('admin.saveError'));
        },
      });
    } else {
      this.api.post<{ success: boolean }>('/admin/programs', body).subscribe({
        next: () => {
          this.successMessage.set(this.translate.instant('admin.saved'));
          setTimeout(() => {
            this.closeProgramForm();
            this.loadPrograms();
          }, 500);
        },
        error: (err) => {
          this.errorMessage.set(err.error?.error || this.translate.instant('admin.saveError'));
        },
      });
    }
  }

  deleteProgram(p: Program) {
    if (!confirm(this.translate.instant('admin.deleteProgramConfirm', { title: p.title }))) return;
    this.api.delete<{ success: boolean }>(`/admin/programs/${p.id}`).subscribe({
      next: () => this.loadPrograms(),
    });
  }

  editSchoolType(st: SchoolType) {
    this.editingSchoolType.set(st);
    this.schoolTypeError.set(null);
    this.schoolTypeSuccess.set(null);
    this.schoolTypeFormLang.set('ru');
    this.api.get<{ success: boolean; schoolType: { titleRu?: string; titleSr?: string; titleEn?: string; descriptionRu?: string; descriptionSr?: string; descriptionEn?: string; sortOrder?: number } }>(`/admin/school-types/raw/${st.id}`).subscribe({
      next: (res) => {
        if (res.success && res.schoolType) {
          const s = res.schoolType as any;
          this.schoolTypeForm = {
            titleRu: s.titleRu ?? st.title ?? '',
            titleSr: s.titleSr ?? '',
            titleEn: s.titleEn ?? '',
            descriptionRu: s.descriptionRu ?? st.description ?? '',
            descriptionSr: s.descriptionSr ?? '',
            descriptionEn: s.descriptionEn ?? '',
            sortOrder: s.sortOrder ?? st.sortOrder ?? 0,
          };
        }
        this.showSchoolTypeForm.set(true);
      },
      error: () => {
        this.schoolTypeForm = { titleRu: st.title ?? '', titleSr: '', titleEn: '', descriptionRu: st.description ?? '', descriptionSr: '', descriptionEn: '', sortOrder: st.sortOrder ?? 0 };
        this.showSchoolTypeForm.set(true);
      },
    });
  }

  closeSchoolTypeForm() {
    this.showSchoolTypeForm.set(false);
    this.editingSchoolType.set(null);
    this.schoolTypeError.set(null);
    this.schoolTypeSuccess.set(null);
  }

  saveSchoolType() {
    const st = this.editingSchoolType();
    this.schoolTypeError.set(null);
    const titleRu = this.schoolTypeForm.titleRu?.trim() ?? '';
    if (!titleRu) {
      this.schoolTypeError.set(this.translate.instant('admin.titleRequired'));
      return;
    }
    const body = {
      titleRu,
      titleSr: this.schoolTypeForm.titleSr?.trim() ?? titleRu,
      titleEn: this.schoolTypeForm.titleEn?.trim() ?? titleRu,
      descriptionRu: this.schoolTypeForm.descriptionRu?.trim() ?? '',
      descriptionSr: this.schoolTypeForm.descriptionSr?.trim() ?? this.schoolTypeForm.descriptionRu?.trim() ?? '',
      descriptionEn: this.schoolTypeForm.descriptionEn?.trim() ?? this.schoolTypeForm.descriptionRu?.trim() ?? '',
      sortOrder: this.schoolTypeForm.sortOrder ?? 0,
    };
    if (st) {
      this.api.put<{ success: boolean; schoolType: SchoolType }>(`/admin/school-types/${st.id}`, body).subscribe({
        next: () => {
          this.schoolTypeSuccess.set(this.translate.instant('admin.saved'));
          this.loadSchoolTypes();
          this.api.get<{ success: boolean; schoolTypes: SchoolType[] }>('/programs/meta/school-types').subscribe({
            next: (r) => { if (r.success) this.schoolTypes.set(r.schoolTypes); },
          });
          setTimeout(() => this.closeSchoolTypeForm(), 800);
        },
        error: (err) => this.schoolTypeError.set(err.error?.error || this.translate.instant('admin.saveError')),
      });
    } else {
      const id = titleRu.toLowerCase().replace(/\s+/g, '-').replace(/[^a-zа-яё0-9-]/gi, '') || 'school-' + Date.now();
      this.api.post<{ success: boolean; schoolType: SchoolType }>('/admin/school-types', { ...body, id }).subscribe({
        next: () => {
          this.schoolTypeSuccess.set(this.translate.instant('admin.saved'));
          this.loadSchoolTypes();
          this.api.get<{ success: boolean; schoolTypes: SchoolType[] }>('/programs/meta/school-types').subscribe({
            next: (r) => { if (r.success) this.schoolTypes.set(r.schoolTypes); },
          });
          setTimeout(() => this.closeSchoolTypeForm(), 800);
        },
        error: (err) => this.schoolTypeError.set(err.error?.error || this.translate.instant('admin.saveError')),
      });
    }
  }

  onSearch(e: Event) {
    const v = (e.target as HTMLInputElement).value.trim();
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => this.loadStudents(v || undefined), 300);
  }
}
