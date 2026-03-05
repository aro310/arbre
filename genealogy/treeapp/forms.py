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
        fields = ['first_name', 'birth_date', 'death_date', 'status', 'photo', 'father', 'mother']
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
        self.fields['children'].queryset = qs

    def clean(self):
        cleaned_data = super().clean()
        status = cleaned_data.get('status')
        death_date = cleaned_data.get('death_date')
        if status == Person.Status.DECEASED and not death_date:
            self.add_error('death_date', 'La date de décès est obligatoire si le statut est décédé.')
        if status == Person.Status.ALIVE and death_date:
            self.add_error('death_date', 'Supprimez la date de décès pour une personne vivante.')
        return cleaned_data

    def save(self, commit=True):
        person = super().save(commit=commit)
        if not commit:
            return person

        selected_children = self.cleaned_data.get('children')
        role = self.cleaned_data.get('parent_role')

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

        return person
