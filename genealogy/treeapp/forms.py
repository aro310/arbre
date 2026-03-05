from django import forms

from .models import Person


class PersonForm(forms.ModelForm):
    children = forms.ModelMultipleChoiceField(
        queryset=Person.objects.none(),
        required=False,
        label='Enfants',
        help_text='Sélectionnez les enfants à rattacher à cette personne.',
    )
    parent_role = forms.ChoiceField(
        choices=(('father', 'Définir comme père'), ('mother', 'Définir comme mère')),
        required=False,
        label='Rôle parental pour les enfants',
    )

    class Meta:
        model = Person
        fields = ['first_name', 'birth_date', 'death_date', 'status', 'photo', 'father', 'mother', 'spouse']
        widgets = {
            'birth_date': forms.DateInput(attrs={'type': 'date'}),
            'death_date': forms.DateInput(attrs={'type': 'date'}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        qs = Person.objects.all()
        if self.instance and self.instance.pk:
            qs = qs.exclude(pk=self.instance.pk)
            self.fields['children'].initial = list(self.instance.children.values_list('pk', flat=True))
        self.fields['father'].queryset = qs
        self.fields['mother'].queryset = qs
        self.fields['spouse'].queryset = qs
        self.fields['children'].queryset = qs

    def clean(self):
        cleaned_data = super().clean()
        status = cleaned_data.get('status')
        death_date = cleaned_data.get('death_date')
        spouse = cleaned_data.get('spouse')

        if status == Person.Status.DECEASED and not death_date:
            self.add_error('death_date', 'La date de décès est obligatoire si le statut est décédé.')
        if status == Person.Status.ALIVE and death_date:
            self.add_error('death_date', 'Supprimez la date de décès pour une personne vivante.')
        if self.instance and self.instance.pk and spouse and spouse.pk == self.instance.pk:
            self.add_error('spouse', 'Une personne ne peut pas être son propre conjoint.')

        return cleaned_data

    def save(self, commit=True):
        previous_spouse_id = None
        if self.instance and self.instance.pk:
            previous_spouse_id = Person.objects.filter(pk=self.instance.pk).values_list('spouse_id', flat=True).first()

        person = super().save(commit=commit)
        if not commit:
            return person

        selected_children = self.cleaned_data.get('children')
        role = self.cleaned_data.get('parent_role')
        spouse = self.cleaned_data.get('spouse')

        for child in person.children:
            if role == 'father' and child.father_id == person.id:
                child.father = None
                child.save(update_fields=['father'])
            if role == 'mother' and child.mother_id == person.id:
                child.mother = None
                child.save(update_fields=['mother'])

        if selected_children:
            for child in selected_children:
                if role == 'father':
                    child.father = person
                    child.save(update_fields=['father'])
                elif role == 'mother':
                    child.mother = person
                    child.save(update_fields=['mother'])

        if previous_spouse_id and (not spouse or previous_spouse_id != spouse.pk):
            previous_spouse = Person.objects.filter(pk=previous_spouse_id).first()
            if previous_spouse and previous_spouse.spouse_id == person.id:
                previous_spouse.spouse = None
                previous_spouse.save(update_fields=['spouse'])

        if spouse:
            if spouse.spouse_id and spouse.spouse_id != person.id:
                former_partner = Person.objects.filter(pk=spouse.spouse_id).first()
                if former_partner:
                    former_partner.spouse = None
                    former_partner.save(update_fields=['spouse'])

            if person.spouse_id != spouse.id:
                person.spouse = spouse
                person.save(update_fields=['spouse'])

            if spouse.spouse_id != person.id:
                spouse.spouse = person
                spouse.save(update_fields=['spouse'])
        elif person.spouse_id:
            old_spouse = Person.objects.filter(pk=person.spouse_id).first()
            if old_spouse and old_spouse.spouse_id == person.id:
                old_spouse.spouse = None
                old_spouse.save(update_fields=['spouse'])
            person.spouse = None
            person.save(update_fields=['spouse'])

        return person
